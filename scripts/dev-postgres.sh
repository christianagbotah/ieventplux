#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# iEventPlux embedded PostgreSQL boot (development sandbox)
#
# Runs PostgreSQL 18 from node_modules (@embedded-postgres — no root, no system
# install). The Next.js app, worker (:3001) and realtime (:3003) all resolve
# DATABASE_URL through src/lib/db.ts, which prefers the project .env's
# postgresql:// URL over the sandbox's exported packaged SQLite default.
#
# Usage after a sandbox restart:
#   bun run db:postgres     # then (re)start the app + mini-services
# Cluster:  /home/z/pgdata  (delete it to re-init; `bun run db:seed` after)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="$PROJECT_DIR/node_modules/@embedded-postgres/linux-x64/native"
PGDATA="${PGDATA:-/home/z/pgdata}"
PGPORT="${PGPORT:-5432}"
PGLOG="${PGLOG:-/home/z/pgdata.log}"
export LD_LIBRARY_PATH="$PGBIN/lib"

if [ ! -x "$PGBIN/bin/postgres" ]; then
  echo "✗ embedded-postgres binaries missing — run: bun install && bun pm trust --all"
  exit 1
fi

# 1) Init the cluster if this is a fresh sandbox volume.
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "→ initdb cluster at $PGDATA (trust auth, user postgres)"
  "$PGBIN/bin/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 > /dev/null
fi

# 2) Start the server if it is not already accepting connections.
if bun -e "import('pg').then(pg => new pg.Client({host:'127.0.0.1',port:$PGPORT,user:'postgres',database:'postgres'}).connect().then(c => c.end()).catch(() => process.exit(1)))" 2>/dev/null; then
  echo "✓ PostgreSQL already running on 127.0.0.1:$PGPORT"
else
  echo "→ starting PostgreSQL on 127.0.0.1:$PGPORT"
  "$PGBIN/bin/pg_ctl" -D "$PGDATA" -l "$PGLOG" -o "-p $PGPORT -h 127.0.0.1" -w start > /dev/null
  echo "✓ PostgreSQL started (log: $PGLOG)"
fi

# 3) Ensure the application database exists.
bun -e "
import('pg').then(async pg => {
  const c = new pg.Client({ host: '127.0.0.1', port: $PGPORT, user: 'postgres', database: 'postgres' })
  await c.connect()
  const r = await c.query('SELECT 1 FROM pg_database WHERE datname = \\'ieventplux\\'')
  if (r.rowCount === 0) { await c.query('CREATE DATABASE ieventplux'); console.log('✓ created database ieventplux') }
  else console.log('✓ database ieventplux present')
  await c.end()
})"
