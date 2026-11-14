# iEventPlux — Deployment Guide

> **Launching for real?** Start at **`docs/GO_LIVE.md`** — the sequenced go-live checklist (staging
> verification per external → first production build → deployment event → post-deploy proof → mobile
> on-device → go/no-go). This runbook is Gate 3's reference material.

Deployment targets are kept configurable. Two supported paths: **(A) this sandbox-style single-host deployment** (what is running now, behind the Caddy gateway) and **(B) production VPS with reverse proxy** (runbook + production checklist). Never point either at another application's ports without that environment being supplied in scope.

## A. What is running now (development topology)

```
Caddy gateway (:81 public)
 ├─ default            → Next.js app  :3000   (portal + /api/v1)
 ├─ ?XTransformPort=3001 → worker     :3001   (outbox jobs)
 └─ ?XTransformPort=3003 → realtime   :3003   (socket.io path /socket.io/)
```

Start order & commands (all from repo root):

```bash
bun install
cp .env.example .env              # fill values; secrets never committed
bun run db:push
bun run db:seed                   # dev only — NEVER in production
bun run dev                       # :3000

cd mini-services/realtime && bun install && cd ../..
(cd mini-services/realtime && bun run dev &)        # :3003
(cd mini-services/worker   && bun run dev &)        # :3001
```

Health verification:

```bash
curl -s localhost:3000/api/v1/health   # healthy + integration stages
curl -s localhost:3001/health
curl -s localhost:3003/health
```

**Dev simulator isolation:** `PAYMENTS_SIMULATOR=1` / `SMS_SIMULATOR=1` are refused when `NODE_ENV=production` (src/server/env.ts throws at boot). The simulator route returns 403 when real Hubtel credentials are configured.

## B. Production VPS runbook

### 1. Prerequisites
- Ubuntu 22.04+, 2 vCPU / 4 GB minimum for a small launch cohort.
- Node 20+ / Bun 1.1+; Caddy or Nginx; a managed PostgreSQL 15+ (recommended over SQLite for concurrent writers); Redis optional (queue is DB-backed).
- TLS via Caddy automatic HTTPS or certbot.

### 2. Configure
```bash
git clone <repo> && cd ieventplux
bun install --production
cp .env.example .env
```
Production-critical (boot fails without): `DATABASE_URL`, `APP_SECRET` (32+ random bytes), `APP_URL` (public origin used for Hubtel return/callback URLs).
Feature-level (degrade truthfully when absent): `HUBTEL_CHECKOUT_CLIENT_ID/SECRET` (+ `HUBTEL_CHECKOUT_BASE`), `HUBTEL_SENDMONEY_*` + account ID, `HUBTEL_SMS_CLIENT_ID/SECRET/SENDER_ID`, `CF_STREAM_API_TOKEN/ACCOUNT_ID`, `SMTP_*`.

**Hubtel production checklist (before going live):**
1. Create the Hubtel account/API keys per https://code.hubtel.com/docs/get-started/keys — separate credentials per API (checkout, Send Money, SMS).
2. Re-verify the exact current endpoint contracts against the official docs (see `docs/PROVIDER_CAPABILITIES.md` — the v1 initiate/callback/status endpoints implemented here must be confirmed before first live charge).
3. Configure the callback URL `${APP_URL}/api/v1/payments/callback` in the merchant dashboard.
4. Run the sandbox verification protocol (documented in PROVIDER_CAPABILITIES) before switching to production credentials.
5. Do NOT set `PAYMENTS_SIMULATOR`/`SMS_SIMULATOR` (auto-mode uses real credentials when present).

### 3. Database
```bash
# SQLite (small deployments): file on persistent disk + WAL already enabled
# PostgreSQL (recommended):
#   change prisma/schema.prisma datasource provider to "postgresql",
#   set DATABASE_URL=postgresql://...
bunx prisma db push              # first deploy (or prisma migrate deploy with a migrations dir)
```
**Never** run `db:seed` in production — it creates known-password accounts.

### 4. Build & run
```bash
bun run build && bun run start          # :3000 (standalone output)
(cd mini-services/realtime && bun install && bun run start &)   # or pm2/systemd units
(cd mini-services/worker && bun run start &)
```
Recommended process manager (systemd template):

```ini
[Unit]
Description=iEventPlux web
[Service]
WorkingDirectory=/opt/ieventplux
EnvironmentFile=/opt/ieventplux/.env
ExecStart=/usr/bin/bun .next/standalone/server.js
Restart=always
User=ieventplux
[Install]
WantedBy=multi-user.target
```
(Repeat for worker `bun mini-services/worker/index.ts` and realtime `bun mini-services/realtime/index.ts`.)

### 5. Reverse proxy (Caddy)
```
events.yourdomain.com {
    reverse_proxy localhost:3000
    # websockets (socket.io) need no special block when proxying all traffic;
    # if splitting, route /socket.io/* → :3003 with ws upgrades enabled.
}
```
If fronting the mini-services publicly, replicate the gateway's `XTransformPort` pattern or expose `/socket.io/` directly to :3003 — pick one and document it.

### 6. Post-deploy verification
```bash
curl -s https://yourdomain.com/api/v1/health      # expect healthy + configured integrations
# golden path: create test event → ₵1 ticket → checkout → verify PAID + journal balanced
# check worker: curl -s localhost:3001/health and admin Outbox view (no DEAD jobs)
```

### 7. Backups (see OPERATIONS.md for full procedure)
- SQLite: `sqlite3 db/custom.db ".backup backup-$(date +%F).db"` on a schedule + offsite copy; test a restore on a staging copy.
- PostgreSQL: `pg_dump` nightly + WAL archiving for point-in-time recovery.
- `/public/uploads` directory + `.env` (sealed).

### 8. Rollback
1. Keep the previous release checkout (`/opt/ieventplux-releases/<ts>`); symlink `current`.
2. `systemctl stop ieventplux-*` → repoint symlink → `prisma db push` (forward-only; schema is additive — never downgrade with data loss) → start → health check.
3. Emergency payment freeze without downtime: set `HUBTEL_CHECKOUT_CLIENT_ID=""` (checkout returns 503 with a clear message; existing data untouched).

### 9. Upgrades
`git pull && bun install && bunx prisma db push && systemctl restart ieventplux-web ieventplux-worker ieventplux-realtime` — worker picks up queued jobs idempotently after restart.

## CI (configured — `.github/workflows/ci.yml`, R32)

Two jobs on every push/PR to `main`:

- **web** — lint (0 errors; warnings are the documented baseline) → `tsc --noEmit` → schema push + seed against a PostgreSQL service container → starts the REAL stack (app + worker + realtime) → **`bun run smoke`** (the 11-check golden-path suite: health, discovery, login/session, event detail, order → simulator checkout → provider callback → worker fulfilment → PAID → ticket listed, admin ops endpoint, 404 contract, and the 429 + Retry-After rate-limit proof) → `ops:monitor --once` + `ops:backup` (proves the ops tooling runs in CI too). Stack logs upload as artifacts on failure.
- **mobile** — `bun test` (40 pure-logic unit tests for the offline check-in queue and ticket wallet) → `tsc --noEmit`.

Honest note: authored with every command verified locally in the dev sandbox; the first run on GitHub-hosted runners should be watched (runner images can differ — the wait loops may need one adjustment). The suite intentionally runs against the DEV payment simulator (no Hubtel credentials in CI) — the entire order → callback → fulfilment → ticket path is the real production code; only the provider boundary is simulated, exactly as in development.

## Mobile release path

See `mobile/README.md` and `mobile/docs/NATIVE_MODULES.md`: Expo dev builds (`expo run:android` / `run:ios`) are required for RTMP broadcasting; store billing configuration is required before enabling digital purchases in native apps (physical event tickets may use Hubtel hosted checkout). No store accounts were configured in this environment — affected flows remain disabled and labelled.
