#!/usr/bin/env bash
# Replay reviewed additive DDL in an isolated CI schema only.
set -euo pipefail
[[ "${CI:-}" == true && "${IEVENTPLUX_ISOLATED_DB_TEST:-}" == yes ]] || exit 2
: "${DATABASE_URL:?Disposable database required}"
node -e 'const u=new URL(process.env.DATABASE_URL);if(!["localhost","127.0.0.1"].includes(u.hostname)||u.port!=="5432"||u.pathname!=="/ieventplux"||!["postgres:","postgresql:"].includes(u.protocol))process.exit(2)'
schema="ievx_push_test_${RANDOM}_${RANDOM}"
psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "CREATE SCHEMA \"$schema\";"
trap 'psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "DROP SCHEMA \"$schema\" CASCADE;"' EXIT
export PGOPTIONS="-c search_path=$schema"
sql(){ psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" "$@"; }
sql -c 'CREATE TABLE "Session" ("id" TEXT PRIMARY KEY); INSERT INTO "Session" VALUES ('"'"'synthetic'"'"');'
for attempt in 1 2; do sql -f ops/migrations/20261126_push_installations.sql; done
sql <<'SQL'
INSERT INTO "PushInstallation" ("keyHash","sessionId","providerToken","platform","updatedAt")
VALUES (repeat('a',64),'synthetic','ExpoPushToken[synthetic_token]','ANDROID',CURRENT_TIMESTAMP);
DO $$ BEGIN
 BEGIN
  INSERT INTO "PushInstallation" ("keyHash","sessionId","providerToken","platform","updatedAt")
  VALUES (repeat('b',64),'synthetic','ExpoPushToken[synthetic_token]','ANDROID',CURRENT_TIMESTAMP);
  RAISE EXCEPTION 'duplicate provider token accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  UPDATE "PushInstallation" SET "platform"='WEB';
  RAISE EXCEPTION 'invalid platform accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE "PushInstallation" SET "sessionId"='missing';
  RAISE EXCEPTION 'invalid session accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 DELETE FROM "Session" WHERE "id"='synthetic';
 IF EXISTS (SELECT 1 FROM "PushInstallation") THEN RAISE EXCEPTION 'orphan device'; END IF;
END $$;
SQL
echo 'PUSH_INSTALLATION_MIGRATION_PASS'
