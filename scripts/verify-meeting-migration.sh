#!/usr/bin/env bash
# Rehearse the additive EventMeeting migration with zero application data.
# Only permitted against the short-lived, localhost GitHub CI database.
set -euo pipefail

if [[ "${CI:-}" != "true" || "${IEVENTPLUX_ISOLATED_DB_TEST:-}" != "yes" ]]; then
  echo 'Refusing migration rehearsal outside the explicitly authorized CI test job.' >&2
  exit 2
fi
: "${DATABASE_URL:?Missing disposable test database URL}"
node -e '
const url = new URL(process.env.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/ieventplux" ||
    !["postgres:", "postgresql:"].includes(url.protocol)) {
  process.stderr.write("Refusing rehearsal: the target is not the isolated CI database.\n");
  process.exit(2);
}'
command -v psql >/dev/null || { echo 'PostgreSQL client is unavailable' >&2; exit 2; }

schema="ievx_meeting_test_${RANDOM}_${RANDOM}"
clean() {
  # This is a disposable schema, never public. The workflow is already
  # connected to its own short-lived PostgreSQL CI service container.
  psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "DROP SCHEMA IF EXISTS \"$schema\" CASCADE;" >/dev/null 2>&1 || true
}
trap clean EXIT
psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "CREATE SCHEMA \"$schema\";"
export PGOPTIONS="-c search_path=$schema"

# Minimal unrelated dummy parent tables: migration FK references can never
# attach to or mutate production 'User' or 'Event' rows.
psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c '
CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
CREATE TABLE "Event" ("id" TEXT PRIMARY KEY);
'
echo 'Rehearsing additive migration (first pass)…'
psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -f scripts/migrations/20261121_event_meetings_additive.sql >/dev/null
echo 'Rehearsing idempotence (second pass)…'
psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -f scripts/migrations/20261121_event_meetings_additive.sql >/dev/null

count="$(psql -X -q -A -t -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='$schema' AND table_name IN ('EventMeeting','MeetingMessage','MeetingBan');")"
if [[ "$count" != 3 ]]; then
  echo "Expected three separate meeting tables, found $count" >&2
  exit 1
fi

psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c '
INSERT INTO "User" ("id") VALUES ('\''attendee'\'');
INSERT INTO "Event" ("id") VALUES ('\''event'\'');
'
if psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c '
INSERT INTO "EventMeeting" ("id","eventId","title","maxParticipants","createdById","updatedAt")
VALUES ('\''too-many'\'','\''event'\'','\''Over capacity'\'',7,'\''attendee'\'',CURRENT_TIMESTAMP);
' >/dev/null 2>&1; then
  echo 'Expected meeting capacity constraint to reject a seven-device room.' >&2
  exit 1
fi

psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c '
INSERT INTO "EventMeeting" ("id","eventId","title","createdById","updatedAt")
VALUES ('\''meeting'\'','\''event'\'','\''Valid group room'\'','\''attendee'\'',CURRENT_TIMESTAMP);
INSERT INTO "MeetingMessage" ("id","meetingId","userId","body")
VALUES ('\''message'\'','\''meeting'\'','\''attendee'\'','\''Hello'\'');
INSERT INTO "MeetingBan" ("meetingId","userId","removedById")
VALUES ('\''meeting'\'','\''attendee'\'','\''attendee'\'');
'
echo 'PASS: additive/idempotent meeting migration, capacity guard, and chat/ban FKs in disposable CI schema.'
