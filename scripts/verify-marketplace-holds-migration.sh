#!/usr/bin/env bash
set -euo pipefail
[[ "${CI:-}" == true && "${IEVENTPLUX_ISOLATED_DB_TEST:-}" == yes ]] || exit 2
: "${DATABASE_URL:?Disposable database required}"
node -e 'const u=new URL(process.env.DATABASE_URL);if(!["localhost","127.0.0.1"].includes(u.hostname)||u.port!=="5432"||u.pathname!=="/ieventplux")process.exit(2)'
schema="ievx_hold_test_${RANDOM}_${RANDOM}"
psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "CREATE SCHEMA \"$schema\";"
trap 'psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "DROP SCHEMA \"$schema\" CASCADE;"' EXIT
export PGOPTIONS="-c search_path=$schema"
sql(){ psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" "$@"; }
sql <<'SQL'
CREATE TABLE "MarketplacePurchaseRequest" (id TEXT PRIMARY KEY);
CREATE TABLE "MarketplaceVariant" (id TEXT PRIMARY KEY);
INSERT INTO "MarketplacePurchaseRequest" VALUES ('request');
INSERT INTO "MarketplaceVariant" VALUES ('variant');
SQL
for attempt in 1 2; do sql -f ops/migrations/20261127_marketplace_stock_holds.sql; done
sql <<'SQL'
INSERT INTO "MarketplaceStockHold" (id,"requestId","expiresAt") VALUES ('hold','request',CURRENT_TIMESTAMP);
INSERT INTO "MarketplaceStockHoldLine" VALUES ('hold','variant',2);
DO $$ BEGIN
 BEGIN
  UPDATE "MarketplaceStockHoldLine" SET quantity=0;
  RAISE EXCEPTION 'invalid quantity accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE "MarketplaceStockHold" SET status='RELEASED';
  RAISE EXCEPTION 'missing release time accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  DELETE FROM "MarketplaceVariant";
  RAISE EXCEPTION 'held variant deleted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
SQL
echo MARKETPLACE_HOLD_MIGRATION_PASS
