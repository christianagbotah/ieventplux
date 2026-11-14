# iEventPlux — Operations Runbook

| | |
|---|---|
| **Topology** | Caddy gateway → Next.js app (:3000) · worker (:3001) · realtime (:3003) · SQLite (`db/custom.db`) |
| **Console** | Admin → `operations` section exposes every sweep with **run-now**; `outbox` section shows queue by status |
| **Scope** | Day-2 operations: monitoring, sweeps, refunds, payouts, SMS triage, backup/restore, rollback |

---

## 1. Service topology & start commands

```bash
# 0) environment
cp .env.example .env       # fill provider credentials when available; see src/server/env.ts

# 1) database
bun run db:push            # prisma db push (schema)
bun run db:seed            # prisma/seed.ts — dev data (password Dev@12345, dev only)

# 2) app (:3000)
bun run dev                # development
bun run build && bun run start   # production build + standalone server

# 3) worker (:3001) — durable OutboxJob queue + sweeps
bun mini-services/worker/index.ts

# 4) realtime (:3003) — socket.io chat/presence/notification push
bun mini-services/realtime/index.ts

# 5) gateway (Caddy) — single origin, XTransformPort query routing
caddy run --config Caddyfile
```

| Service | Port | Health | Authenticated endpoint |
|---|---|---|---|
| App | 3000 | `GET /api/v1/health` (db + env validation + integration stages) | — |
| Worker | 3001 | `GET /health` → `{workerId, uptimeSec}` | `GET /stats` with `X-Worker-Secret` → OutboxJob counts by status |
| Realtime | 3003 | `GET /health` → `{rooms, connections}` | `POST /emit` with `X-Realtime-Secret` |
| Gateway | :81 (Caddyfile) | proxies default → :3000; `?XTransformPort=3001/3003` → mini-services | — |

Order matters: database first, then app/worker/realtime (the worker and app both open the SQLite file; Caddy last so routing exists before traffic).

## 2. Queue monitoring

- **Live view:** admin console → `outbox` (jobs grouped by `status`: QUEUED / RUNNING / DONE / DEAD).
- **Direct:** `curl -s -H "X-Worker-Secret: $WORKER_SECRET" http://localhost:3001/stats`.
- **Job fields to inspect:** `type`, `attempts`/`maxAttempts`, `runAt` (retry backoff `min(5 min, 2 s·2^attempts)`), `lockedBy`/`lockedAt` (locks >90 s are stale-reclaimable), `lastError`.

### DEAD jobs (the queue's red line)

A `DEAD` job means a handler failed `maxAttempts` times (default 5; sweeps 3). Treat as an incident:

1. Read `lastError` in the admin outbox view (or query `OutboxJob` where `status='DEAD'`).
2. Correlate: `PROCESS_PROVIDER_EVENT` → check the referenced `ProviderEvent`/`PaymentAttempt`; `SEND_MESSAGE` → check `MessageDelivery` + provider status; sweeps → check clock skew and DB contention.
3. Fix the cause (e.g. provider outage, bad payload).
4. Re-drive by inserting a fresh QUEUED job of the same type/payload (handlers are idempotent — replays are safe) **after** confirming the underlying record is in a consistent state.
5. If a DEAD `PROCESS_PROVIDER_EVENT` carried a real payment, reconcile the attempt manually via the payments section before re-driving.

Never edit a DONE/DEAD job's history — the queue is part of the audit trail.

## 3. Sweeps runbook

All sweeps are idempotent and safe to run repeatedly; each also runs on schedule (worker) and on demand (admin → operations → run now; server-side `sweepOnce`).

| Sweep | Schedule | What it does | Operator notes |
|---|---|---|---|
| `RECONCILE_PAYMENT` | 60 s | Status-checks attempts older than 5 min with no callback, max 6 checks; routes unresolved to UNKNOWN | UNKNOWN attempts = ops queue: resolve with the provider, then record the outcome; never bulk-expire |
| `RESERVATION_SWEEP` | 20 s | Releases expired reservations, decrements `reservedCount`, expires stale unpaid orders (only if no SUCCESS attempt) | Rising `ordersExpired` during on-sales is normal; investigate only if buyers report paid-but-expired |
| `REMINDER_SWEEP` | 300 s | Notifies ticket holders of events starting within 24 h (dedup via `PlatformSetting` markers) | Idempotent per event/day; safe to re-run |
| `EVENT_LIFECYCLE` | 60 s | Publishes SCHEDULED events whose `publishAt` passed; auto-ENDs events past end + 30 min grace (and ends their live broadcasts); advances campaign statuses | Verify event timezone data if an event never transitions |
| `SMS_STATUS_POLL` | 30 s | Polls delivery state for ACCEPTED SMS (≤50 per pass) | See §6 triage |
| `PLAYBACK_CLEANUP` | 120 s | Revokes playback sessions whose expiry passed >30 min ago | No operator action unless sessions leak |

Platform knobs (admin → settings; defaults in `src/server/settings.ts`): `reservationMinutes` 15 · `reconcileAfterMinutes` 5 · `maxReconcileChecks` 6 · `payoutHoldDays` 3 · `quietHoursStart` 20 / `quietHoursEnd` 8 · `maxSmsSegmentsPerMessage` 6 · `outboxMaxAttempts` 5 · `gracePeriodDays` 3.

## 4. Refund support workflow

1. **Intake.** Cases arrive from three sources: buyer/org requests (`refund:request`), `system:duplicate-payment`, `system:late-payment`. All appear in admin → `refunds`.
2. **Triage.** Check the order (`status`, payments, tickets, exception reason) and the case reason. `EXCEPTION_REVIEW` orders exist precisely so money is never lost here.
3. **Process (privileged).** FINANCE_ADMIN/SUPER_ADMIN only; the console demands **elevation** (password re-check, 10-min window). Processing revokes unused VALID tickets first, then posts the reversal journal (`refund:{caseId}`), then marks PROCESSED and notifies the buyer.
4. **MANUAL_TRACKED.** If the provider path is unsupported/pending verification, the case stays `MANUAL_TRACKED` with evidence. Complete it outside the platform (provider dashboard), record the resolution note, and only then close the case — never fake a PROCESSED state.
5. **Rules.** One open case per order; no re-processing of PROCESSED cases; full-order amounts only (see `PAYMENTS_AND_SETTLEMENTS.md` §7).

## 5. Payout support workflow

1. **Request.** Org payout roles request an amount ≤ available (`organizer_payable − settlement holds`).
2. **Approve.** Platform finance approves → a `SettlementHold` is created (funds ring-fenced while in flight).
3. **Submit.** With Send Money credentials this posts the payout journal and marks SUBMITTED; **without credentials the submission is blocked and recorded** (`PAYOUTS_BLOCKED…`) — the payout stays APPROVED and can be completed manually/after contracting. Do not work around by editing states.
4. **Settle.** Mark PAID (hold released) when the provider confirms; on failure mark FAILED — the reversal journal returns funds to `organizer_payable`, the hold releases, and a **retry must reuse the same payout reference**.
5. **Reconciliation habit.** Compare `orgFinanceSummary` (payable, holds, in-flight, completed) against provider statements before marking PAID.

## 6. SMS failure triage

`MessageDelivery.status` is the source of truth (`QUEUED → SENT/ACCEPTED → DELIVERED | FAILED | SUPPRESSED`):

| Symptom | Likely cause | Action |
|---|---|---|
| Many `FAILED` with provider error text | Hubtel outage / wrong credentials / unapproved sender ID | Check `/api/v1/health` integrations; verify `HUBTEL_SMS_*`; then re-drive via a fresh `SEND_MESSAGE` job (idempotent — terminal statuses are skipped) |
| Stuck at `ACCEPTED` | Delivery receipt not yet polled or number unreachable | Wait for `SMS_STATUS_POLL`; check the number's state with the provider if persistent |
| `SUPPRESSED` (no consent) | Marketing consent absent | Expected behaviour — never override; the buyer must opt in |
| `SUPPRESSED` (no SMTP) | Email channel without SMTP config | Configure `SMTP_*` or accept suppression |
| `FAILED` (quiet hours / quota) | Campaign attempted 20:00–08:00 or over monthly quota | Re-schedule outside quiet hours; raise quota via settings if justified |
| Simulator `DELIVERED` | Dev simulator labelled synthetic | Confirm `SMS_SIMULATOR` mode before treating as real delivery |

Remember: **API acceptance ≠ handset delivery** — customer-facing answers should rely on DELIVERED only.

## 7. Backup & restore

### Logical snapshot (works on BOTH providers — the built-in audited path, R32)

```bash
bun run ops:backup
# → backups/ieventplux-2026-11-14T04-09-59.jsonl.gz
#   68 tables · row counts · gzip · SHA-256 · re-read verification
#   BackupRun audit row (Admin → Ops Health renders the trail)
#   retention: newest 30 by default (BACKUP_RETENTION)
```

- Each line is `{"t":"TableName","r":{…}}` — provider-agnostic, inspectable, restorable by row-insert.
- The script VERIFIES itself: the file is re-read after writing and the line count must equal the counted rows (a mismatch marks the run FAILED).
- Schedule: at least daily; always immediately before a migration or any administrative money action.

### SQLite (single-writer deployments)

```bash
# consistent backup (WAL-aware)
sqlite3 /home/z/my-project/db/custom.db "VACUUM INTO '/backups/ieventplux-$(date +%F-%H%M).db'"

# or: stop app+worker, then copy the trio
cp db/custom.db db/custom.db-wal db/custom.db-shm /backups/
```

- Frequency: at least daily plus before any migration/administrative money action.
- Restore: stop app + worker (realtime can stay), replace `db/custom.db` (and `-wal`/`-shm`) from the backup, restart services, then run a reconciliation sweep and compare `orgFinanceSummary` totals with the last known-good figures.
- Retention: keep point-in-time copies around every payout batch and fee-version change — they are the ledger's forensic anchor.

### PostgreSQL (production path)

- `bun run ops:backup` (logical, portable) PLUS `pg_dump` nightly + WAL archiving/PITR; test restores quarterly; the schema needs no SQLite-specific translation (`DATA_MODEL.md` §5).

## 8. Rollback steps

1. **Code rollback:** the deployment is a standalone build — redeploy the previous build directory (`bun .next/standalone/server.js`), keeping the database untouched. API versioning (`/api/v1`) is the compatibility contract; avoid rolling back across a schema change.
2. **Schema rollback:** `prisma db push` is forward-only in practice — restore from backup (§7) rather than hand-editing. Before any risky migration: backup + dry-run on a copy.
3. **Bad money state:** never UPDATE ledger rows. Post a correcting `ADJUSTMENT` journal via the platform (finance role + elevation) and record an audit note.
4. **Stuck queue:** stop worker → inspect DEAD jobs → fix cause → restart (stale locks >90 s self-heal on restart).
5. **Provider incident:** providers being down degrades features gracefully (env.ts stages); no rollback required — monitor `/api/v1/health` until the provider recovers.

## 9. Monitoring hooks

| Hook | What it tells you |
|---|---|
| `bun run ops:monitor` (R32) | The standing loop: probes app + worker + realtime + database every 30 s (MONITOR_INTERVAL_SEC), writes durable OpsCheck rows (uptime history) and opens/resolves transition-based OpsAlerts. `--once` for a single cron-style cycle. |
| Admin → `Ops Health` (R32) | The same data in-console: per-target status/latency/uptime 24h/7d, alert trail, backup audit trail, and a "Run check now" button that records an on-demand cycle through the same runner |
| `GET :3000/api/v1/health` | DB up/down, env validation errors/warnings, per-integration stage (`implemented` / `sandbox-verified` / `live-verified` / `externally-blocked`), mode (real/simulated/unavailable) |
| `GET :3001/health` | Worker identity + uptime |
| `GET :3001/stats` (secret) | OutboxJob counts by status — alert on `DEAD > 0` and `RUNNING` older than a few minutes |
| `GET :3003/health` | Room count + connected clients |
| Admin → `integrations` | Same integration stages as health, in-console |
| Admin → `outbox` / `sms` / `audit` | Queue, delivery log, privileged-action trail |

Retention (enforced by the monitor's hourly prune): OpsCheck 7 days, RESOLVED OpsAlerts 30 days — open alerts are never pruned. Uptime percentages are honest: they are `null` ("no check recorded yet") until the first cycle exists.

Suggested alerts (wire to any uptime monitor): health `status != healthy`, worker DEAD jobs > 0, UNKNOWN payment attempts > 0 (sustained), FAILED SMS ratio spike, realtime connections = 0 during a scheduled live event.

### Rate limiting (R32 — shared store)

The per-instance in-memory limiter is RETIRED: every protected route now increments one durable `RateLimitBucket` row per (scope, client IP, fixed window) via an atomic PostgreSQL UPSERT — horizontally-scaled deployments enforce a single global budget. 429 responses carry a real `Retry-After` header. The limiter fails OPEN if the database is unreachable (availability beats blocking; logged, throttled). Expired buckets are swept at most once per minute.

## 10. Routine operator checklist

| Cadence | Task |
|---|---|
| Daily | Health endpoints; DEAD jobs; UNKNOWN payments; refund/payout queues; SMS failure ratio |
| Per event (major) | Confirm lifecycle transitions (SCHEDULED→PUBLISHED, LIVE→ENDED) and reminder delivery |
| Weekly | Backup restore spot-check; audit log skim; ledger DR=CR sanity (`admin → ledger`); outbox DONE growth vs business volume |
| Monthly | Payout reconciliation vs provider statements; fee-version review; capacity/quota review for on-sales; rotate worker/realtime secrets if exposed staff change |
