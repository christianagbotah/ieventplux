#!/usr/bin/env bash
# Disposable GitHub Actions service database only. Never load staging credentials here.
set -euo pipefail
[[ "${CI:-}" == true && "${IEVENTPLUX_ISOLATED_DB_TEST:-}" == yes ]] || exit 2
: "${DATABASE_URL:?CI database required}"
node -e 'const u=new URL(process.env.DATABASE_URL);if(!["localhost","127.0.0.1"].includes(u.hostname)||u.port!=="5432"||u.pathname!=="/ieventplux")process.exit(2)'
# Isolate all records in a new CI-only schema. No existing rows or provider calls.
# The source is a schema-only export from the fresh CI service, not staging.
# A separate database avoids cross-schema foreign keys and default search paths.
fixture_db="ievx_fixture_ci_${RANDOM}_${RANDOM}"
fixture_url=$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/"+process.argv[1];console.log(u.toString())' "$fixture_db")
psql -Xq -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "CREATE ROLE ieventplux_app NOLOGIN;"
psql -Xq -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -c "CREATE DATABASE \"$fixture_db\" OWNER ieventplux_app;"
# The ephemeral Actions postgres service is discarded by GitHub after the job.
pg_dump --schema-only --no-owner --no-acl -d "$DATABASE_URL" | { printf 'SET ROLE ieventplux_app;\n'; cat; } | psql -Xq -v ON_ERROR_STOP=1 -d "$fixture_url"
seed(){ { printf 'SET ROLE ieventplux_app;\n'; cat ops/qa/staging-fixtures.sql; } | psql -Xq -v ON_ERROR_STOP=1 -v password_hash=CI_FIXTURE_NO_LOGIN -d "$fixture_url"; }
seed
{ printf 'SET ROLE ieventplux_app;\n'; cat ops/qa/verify-fixture-batch.sql; } | psql -Xq -v ON_ERROR_STOP=1 -d "$fixture_url"
if seed; then echo 'ERROR: duplicate QA fixture load accepted'; exit 1; fi
{ printf 'SET ROLE ieventplux_app;\n'; cat ops/qa/verify-fixture-batch.sql; } | psql -Xq -v ON_ERROR_STOP=1 -d "$fixture_url"
echo QA_FIXTURE_REHEARSAL_PASS
