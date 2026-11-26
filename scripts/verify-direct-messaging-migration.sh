#!/usr/bin/env bash
set -euo pipefail
[[ "${CI:-}" == true && "${IEVENTPLUX_ISOLATED_DB_TEST:-}" == yes ]] || exit 2
: "${DATABASE_URL:?Disposable database required}"
node -e 'const u=new URL(process.env.DATABASE_URL);if(!["localhost","127.0.0.1"].includes(u.hostname)||u.port!=="5432"||u.pathname!=="/ieventplux"||!["postgres:","postgresql:"].includes(u.protocol))process.exit(2)'
schema="ievx_direct_test_${RANDOM}_${RANDOM}"
psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "CREATE SCHEMA \"$schema\";"
trap 'psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "DROP SCHEMA \"$schema\" CASCADE;"' EXIT
export PGOPTIONS="-c search_path=$schema"
sql(){ psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" "$@"; }
sql <<'SQL'
CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
CREATE TABLE "Session" ("id" TEXT PRIMARY KEY);
INSERT INTO "Session" VALUES ('session-a');
INSERT INTO "User" VALUES ('a'),('b'),('c');
SQL
for attempt in 1 2; do sql -f ops/migrations/20261126_direct_messaging.sql; sql -f ops/migrations/20261126_direct_activity.sql; done
sql <<'SQL'
INSERT INTO "DirectConversation" ("id","participantLowId","participantHighId","requesterId","updatedAt") VALUES ('d','a','b','a',CURRENT_TIMESTAMP);
INSERT INTO "DirectMessage" ("id","conversationId","senderId","clientKey","body") VALUES ('m','d','a','abcdefghijklmnop','Hello');
INSERT INTO "DirectActivity" ("conversationId","sessionId","activeUntil","typingUntil") VALUES ('d','session-a',CURRENT_TIMESTAMP+INTERVAL '20 seconds',CURRENT_TIMESTAMP+INTERVAL '8 seconds');
DO $$ BEGIN
 BEGIN
  UPDATE "DirectActivity" SET "typingUntil"="activeUntil"+INTERVAL '1 second';
  RAISE EXCEPTION 'typing outlives activity';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO "DirectConversation" ("id","participantLowId","participantHighId","requesterId","updatedAt") VALUES ('duplicate','a','b','b',CURRENT_TIMESTAMP);
  RAISE EXCEPTION 'duplicate pair accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  UPDATE "DirectConversation" SET "requesterId"='c';
  RAISE EXCEPTION 'nonparticipant requester accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE "DirectConversation" SET "status"='UNKNOWN';
  RAISE EXCEPTION 'unknown request status accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO "DirectMessage" ("id","conversationId","senderId","clientKey","body") VALUES ('retry','d','a','abcdefghijklmnop','Hello');
  RAISE EXCEPTION 'duplicate message key accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  UPDATE "DirectMessage" SET "body"='';
  RAISE EXCEPTION 'empty message accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 DELETE FROM "User" WHERE id='a';
 IF EXISTS (SELECT 1 FROM "DirectConversation") OR EXISTS (SELECT 1 FROM "DirectMessage") OR EXISTS (SELECT 1 FROM "DirectActivity") THEN RAISE EXCEPTION 'orphan conversation or message'; END IF;
END $$;
SQL
echo 'DIRECT_MESSAGING_MIGRATION_PASS'
