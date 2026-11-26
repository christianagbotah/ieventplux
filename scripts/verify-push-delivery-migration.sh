#!/usr/bin/env bash
set -euo pipefail
[[ "${CI:-}" == true && "${IEVENTPLUX_ISOLATED_DB_TEST:-}" == yes ]] || exit 2
: "${DATABASE_URL:?Disposable database required}"
node -e 'const u=new URL(process.env.DATABASE_URL);if(!["localhost","127.0.0.1"].includes(u.hostname)||u.port!=="5432"||u.pathname!=="/ieventplux")process.exit(2)'
schema="ievx_push_delivery_test_${RANDOM}_${RANDOM}"
psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "CREATE SCHEMA \"$schema\";"
trap 'psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "DROP SCHEMA \"$schema\" CASCADE;"' EXIT
export PGOPTIONS="-c search_path=$schema"
sql(){ psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" "$@"; }
sql <<'SQL'
CREATE TABLE "Session" ("id" TEXT PRIMARY KEY);
CREATE TABLE "Notification" ("id" TEXT PRIMARY KEY,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO "Session" VALUES ('s');
INSERT INTO "Notification" ("id") VALUES ('n');
SQL
sql -f ops/migrations/20261126_push_installations.sql
for attempt in 1 2; do sql -f ops/migrations/20261126_push_delivery.sql; sql -f ops/migrations/20261126_push_lease.sql; done
sql <<'SQL'
INSERT INTO "PushInstallation" ("keyHash","sessionId","providerToken","platform","updatedAt") VALUES (repeat('a',64),'s','ExpoPushToken[synthetic_token]','ANDROID',CURRENT_TIMESTAMP);
INSERT INTO "PushDelivery" ("id","notificationId","installationKeyHash","sessionId","activationAt","updatedAt") VALUES ('d','n',repeat('a',64),'s',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "PushInstallation" WHERE "leaseUntil" IS NOT NULL) THEN RAISE EXCEPTION 'legacy row unexpectedly leased'; END IF;
 BEGIN
  INSERT INTO "PushDelivery" ("id","notificationId","installationKeyHash","sessionId","activationAt","updatedAt") VALUES ('duplicate','n',repeat('a',64),'s',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  RAISE EXCEPTION 'duplicate delivery accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  UPDATE "PushDelivery" SET "attempts"=4;
  RAISE EXCEPTION 'unbounded retry accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE "PushDelivery" SET "status"='DELIVERED_TO_PHONE';
  RAISE EXCEPTION 'unsupported delivery claim accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 DELETE FROM "Notification" WHERE id='n';
 IF EXISTS (SELECT 1 FROM "PushDelivery") THEN RAISE EXCEPTION 'orphan delivery'; END IF;
END $$;
SQL
echo 'PUSH_DELIVERY_MIGRATION_PASS'
