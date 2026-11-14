# iEventPlux — Deployment Runbook (PostgreSQL / production standalone)

> **Launch authority:** Complete [GO_LIVE.md](GO_LIVE.md) in order. This runbook is the technical reference for Gate 3; it is **not** evidence that real provider contracts, hosting or live transactions have passed. The old SQLite/sandbox instructions are intentionally superseded.

## 1. Deployment shape

- Web/API: Next.js 16 standalone, locally bound to `127.0.0.1:3000`.
- Worker: `bun mini-services/worker/index.ts`, locally bound to `:3001`.
- Realtime: `bun mini-services/realtime/index.ts`, locally bound to `:3003`.
- Database: dedicated managed PostgreSQL 15+ instance; Prisma schema currently declares `provider = "postgresql"`. No SQLite instructions apply to this release.
- Caddy terminates HTTPS and routes `/socket.io/*` to realtime, everything else to web/API. Do **not** publicly expose service ports or the development `?XTransformPort=` gateway.
- Monitor, offsite backups, and restore rehearsal are required before first live money movement.

## 2. Host prerequisites (operator)

Use a dedicated non-root Unix account, Ubuntu LTS, a supported Bun runtime, egress to the approved providers, managed PostgreSQL with restricted network ACLs, and inbound firewall ports 22 (restricted), 80, 443 only. Configure a DNS name before requesting TLS.

Do not share the project with other production workloads on ports 3000/3001/3003 without first resolving port conflicts. Keep a previous known-good release directory for rollback.

## 3. Install and configure (operator)

```bash
# In a release directory owned by the ieventplux service account:
git clone https://github.com/christianagbotah/ieventplux.git /srv/ieventplux
cd /srv/ieventplux
git checkout <reviewed-commit-sha>   # same SHA as approved CI
bun install --frozen-lockfile          # build requires devDependencies
cp .env.example .env
chmod 600 .env
```

Edit `.env` securely **without committing or printing secrets**. Required: `NODE_ENV=production`, `DATABASE_URL` (managed PostgreSQL URL), `APP_SECRET` (fresh high-entropy value), `APP_URL=https://<public-hostname>`, unique `WORKER_SECRET` and `REALTIME_SECRET`. Configure Hubtel Checkout, Send Money, Hubtel SMS, SMTP, and Cloudflare Stream using verified production credentials.

Production is **fail-closed** for payment, SMS and payout simulation: unset/invalid credentials must produce an unavailable state, not fake success. Check the integration modes at `GET /api/v1/health`. Setting `PAYMENTS_SIMULATOR=1` or `SMS_SIMULATOR=1` in production is forbidden.

## 4. Database initialization — empty database only

```bash
bunx prisma generate
# FIRST installation only, on a deliberately empty database:
bunx prisma db push
```

**Never** run `bun run db:seed` on production. It creates known-password demonstration accounts. **Never** use `bun run db:push` in production; its package script passes `--accept-data-loss`. This repository has no committed Prisma migration history at the Round 34 handoff. For subsequent schema changes, create and review migration SQL in development, rehearse on a staging copy, take/verify a backup, then use a controlled migration procedure. Do not use `db push` as an unattended upgrade.

Create the initial administrator with the **interactive, no-demo-seed** bootstrap script, on the empty live database only:

```bash
# `.env` already securely configured; no password on CLI or in environment.
export BOOTSTRAP_ADMIN_EMAIL=admin@yourdomain.com
export BOOTSTRAP_ADMIN_NAME="Platform Administrator"
bun run ops:bootstrap-admin  # prompts twice for a new hidden 16+-character password
unset BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_NAME
```

The script requires production mode, a non-placeholder APP_SECRET, PostgreSQL, a real TTY, and **zero existing users**, enforced under a PostgreSQL advisory transaction lock. It creates only one SUPER_ADMIN account and refuses a repeat. Exercise this procedure against an **empty staging database first**, then check administrator login; it remains **unverified on real infrastructure** until the launch gate is signed off.

## 5. Build and run

```bash
bun run typecheck
bun run build
test -f .next/standalone/server.js
PORT=3000 HOSTNAME=127.0.0.1 NODE_ENV=production bun .next/standalone/server.js
```

Round 35 adds a dedicated GitHub Actions `production-build` job that runs the standalone build against ephemeral PostgreSQL and boots the artifact separately from the development smoke suite. Require **all** web, mobile, production-build jobs green for the exact release SHA; a green dev-server suite alone is not sufficient.

Example systemd unit (adjust the Bun binary path using `command -v bun`, and validate `.env` formatting is compatible with systemd):

```ini
[Unit]
Description=iEventPlux web API
Wants=network-online.target
After=network-online.target
[Service]
User=ieventplux
WorkingDirectory=/srv/ieventplux
EnvironmentFile=/srv/ieventplux/.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/local/bin/bun .next/standalone/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
```

Create corresponding `ieventplux-worker.service` and `ieventplux-realtime.service` using `ExecStart=/usr/local/bin/bun mini-services/worker/index.ts` / `mini-services/realtime/index.ts`, plus an `ieventplux-monitor.service` using `ExecStart=/usr/local/bin/bun run ops:monitor`. Use `systemctl daemon-reload`, `systemctl enable --now`, and `systemctl status` to verify each before public exposure.

## 6. TLS gateway

Production Caddy configuration (replace hostname):

```caddy
events.example.com {
    @socket path /socket.io/*
    handle @socket {
        reverse_proxy 127.0.0.1:3003
    }
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

Worker `:3001` remains internal. The existing root `Caddyfile` is a **development-only gateway** and must not be used as-is in production: its `XTransformPort` query accepts arbitrary ports.

## 7. Post-deployment checks

```bash
curl -fsS https://<public-hostname>/api/v1/health
# READ-ONLY probe. Never run the dev smoke suite on real customer data:
PROD_SMOKE_BASE_URL=https://<public-hostname>/api/v1 REQUIRE_LIVE_INTEGRATIONS=1 bun run prod:smoke
bun run ops:monitor -- --once
curl -fsS http://127.0.0.1:3001/health
curl -fsS http://127.0.0.1:3003/health
```

`prod:smoke` performs safe GET probes; it does **not** create orders, log in as demo users, issue payment callbacks or burn password-reset limits. It checks that provider credentials are configured, **not** that their external contracts have been verified. Complete all live provider/ledger/reconciliation checks separately under GO_LIVE Gates 1 and 4.

**Important:** `bun run smoke` uses known demo accounts, simulated checkout and intentionally mutating API requests. It is strictly for an isolated, seeded development/CI database and **must not** be run against production.

## 8. Backups, restore, monitoring

- Schedule `bun run ops:backup` daily, retain and secure checksummed logical snapshots and offsite copies, and also configure provider-native `pg_dump` plus managed PITR/WAL where supported.
- Back up user-uploaded assets separately. Test an actual restore **into a scratch database**, compare all table counts, and record evidence before the first live sale.
- Monitor database, web, worker, realtime and dead-letter outbox jobs; restrict `GET /stats` by `WORKER_SECRET`.
- During financial incidents, reconcile with the provider. A database restore is not equivalent to undoing a bank/MoMo transfer.

See [OPERATIONS.md](OPERATIONS.md) for incident, queue and restore procedures.

## 9. Rollback and upgrades

For a code-only rollback, stop the affected services, switch to a previous compatible release artifact, restart, and rerun the **read-only** production smoke. **Do not** run `prisma db push` during rollback, and **do not** automatically restore an old database snapshot: live payments may have occurred since the backup. Database restoration requires a separate incident decision, downtime, confirmed recovery point and financial reconciliation.

For upgrades: review migration SQL and backwards compatibility, verify an offsite backup and scratch restore, deploy the exact green CI SHA, restart services, verify `prod:smoke`, then monitor. On a provider-API mismatch or any unverified money path, disable sales/payouts until resolved rather than marking them successful.

---

Current status: implementation and synthetic CI coverage do not constitute permission to launch. The exact production credentials, device pass, traffic/load tests, independent security review, migration baseline, admin bootstrap and end-to-end live deployment still require evidence or explicit risk acceptance.
