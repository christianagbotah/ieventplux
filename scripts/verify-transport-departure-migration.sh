#!/usr/bin/env bash
# Rehearse the exact deployment SQL in an isolated disposable CI schema.
set -euo pipefail
[[ "${CI:-}" == true && "${IEVENTPLUX_ISOLATED_DB_TEST:-}" == yes ]] || { echo 'CI-only migration rehearsal' >&2; exit 2; }
: "${DATABASE_URL:?Missing disposable database URL}"
node -e '
const u=new URL(process.env.DATABASE_URL);
if(!["localhost","127.0.0.1"].includes(u.hostname)||u.port!=="5432"||u.pathname!=="/ieventplux"||!["postgres:","postgresql:"].includes(u.protocol))process.exit(2)
'
schema="ievx_departure_test_${RANDOM}_${RANDOM}"
psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "CREATE SCHEMA \"$schema\";"
trap 'psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "DROP SCHEMA \"$schema\" CASCADE;"' EXIT
export PGOPTIONS="-c search_path=$schema"
sql(){ psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" "$@"; }
sql <<'SQL'
CREATE TABLE "TransportRouteDraft" ("id" TEXT PRIMARY KEY);
CREATE TABLE "TransportVehicle" ("id" TEXT PRIMARY KEY);
INSERT INTO "TransportRouteDraft" VALUES ('route');
INSERT INTO "TransportVehicle" VALUES ('vehicle');
SQL
for attempt in 1 2; do
 sql -f ops/migrations/20261125_transport_departures.sql
done
sql <<'SQL'
INSERT INTO "TransportDepartureDraft" ("id","routeId","vehicleId","departureAt","arrivalAt","allocatedSeats","updatedAt")
VALUES ('valid','route','vehicle','2030-01-01 06:00','2030-01-01 08:00',20,CURRENT_TIMESTAMP);
DO $$
BEGIN
 BEGIN
  INSERT INTO "TransportDepartureDraft" ("id","routeId","vehicleId","departureAt","arrivalAt","allocatedSeats","updatedAt")
  VALUES ('duplicate','route','vehicle','2030-01-01 06:00','2030-01-01 08:00',20,CURRENT_TIMESTAMP);
  RAISE EXCEPTION 'duplicate slot accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  UPDATE "TransportDepartureDraft" SET "allocatedSeats"=0 WHERE "id"='valid';
  RAISE EXCEPTION 'invalid capacity accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE "TransportDepartureDraft" SET "arrivalAt"="departureAt" WHERE "id"='valid';
  RAISE EXCEPTION 'invalid time accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE "TransportDepartureDraft" SET "state"='CONFIRMED' WHERE "id"='valid';
  RAISE EXCEPTION 'commercial state accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE "TransportDepartureDraft" SET "vehicleId"='missing' WHERE "id"='valid';
  RAISE EXCEPTION 'invalid vehicle accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
END $$;
SQL
echo 'PASS: exact additive departure migration twice; slot uniqueness, bounds, states and foreign keys.'
