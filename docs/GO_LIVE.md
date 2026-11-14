# iEventPlux — Go-Live Checklist (the launch procedure)

> **How to use this document.** Development is done and evidenced (32 rounds, CI green on GitHub's
> runners, `docs/TEST_REPORT.md`). What remains between "code ready" and "first real customer" is a
> **launch procedure**, not development. Execute the gates **in order**. Each gate has: commands,
> expected results, and an explicit abort condition. Do not skip a failed gate — every one exists
> because the thing it verifies has never run against real infrastructure or real providers.
>
> Owner notation: each gate lists who executes it (operator = whoever runs the VPS; organizer = the
> event business owner with provider dashboard access).

---

## Gate 0 — Pre-flight (all verifiable before credentials arrive)

| # | Check | Command / where | Pass condition |
|---|---|---|---|
| 0.1 | CI green on latest main | https://github.com/christianagbotah/ieventplux/actions | web + mobile jobs `success` on the commit being deployed |
| 0.2 | Zero boot-validation errors locally | `curl -s localhost:3000/api/v1/health \| jq .validation.errors` | `[]` |
| 0.3 | Env completeness audit | `grep -rhoE "process\.env\.[A-Z_0-9]+" src/ scripts/ \| …` vs `.env.example` | every key documented (done in R33 — re-run if env surface changes) |
| 0.4 | Backup taken AND restored successfully | `bun run ops:backup` then `bun run ops:restore -- --target <scratch DB URL>` | `verification: every restored table's count matches the dump — restore OK` |
| 0.5 | Smoke suite green | `bun run smoke` | 11/11 |
| 0.6 | Secrets ledger (operator) | `.env` filled from `.env.example` | every blank below Gate 1 filled with STAGING credentials first |

**Abort if:** any row fails. Fix in development first — never debug on launch day.

---

## Gate 1 — Staging verification per external (the "configured ≠ verified" pass)

Each integration point is code-complete and its contract mirrored in the dev simulator, but none has
ever touched the live provider. Verify with **staging/test credentials** first, one at a time:

### 1.1 Hubtel Online Checkout (collections)
1. Set `HUBTEL_CHECKOUT_*` (staging keys) → restart app.
2. Health check: `GET /api/v1/health` → payments integration `mode: "real"`.
3. Create a test event + ₵1 ticket → buy it with a real card/MoMo on the staging gateway.
4. **Verify:** order becomes `PAID`, ticket issued, the payment journal balances
   (`attempt.amountMinor == sum of ledger entries`), provider reference stored on the attempt.
5. **Abort if:** the provider response shape differs from the documented contract — the callback
   handler is built to the docs; reconcile field-by-field before proceeding.

### 1.2 Hubtel Send Money (payouts)
1. Set `HUBTEL_SENDMONEY_*` (staging) → organizer payout request for the test event's ₵1.
2. **Verify:** payout record leaves `PENDING`, provider transaction id recorded, admin Send Money
   view shows the true provider status.
3. **Abort if:** charges succeed but payouts reject — do not launch with a broken payout path.

### 1.3 Hubtel SMS
1. Set `HUBTEL_SMS_*` + sender ID → trigger one transactional SMS (e.g. ticket confirmation SMS).
2. **Verify:** delivery log row leaves the simulator (`status != SIMULATED`), provider delivery
   callback matches, phone receives the message.

### 1.4 SMTP (transactional email)
1. Set `SMTP_*` → password-reset + ticket email.
2. **Verify:** inbox delivery (not spam), message status `SENT` in the admin Outbox (never `SUPPRESSED`).

### 1.5 Cloudflare Stream (live delivery)
1. Set `CF_STREAM_API_TOKEN` + `CF_STREAM_ACCOUNT_ID` → restart.
2. Organizer starts a test broadcast: **verify** real RTMP ingest appears in the Cloudflare
   dashboard, entitled attendee sees live video, replay appears after stream end.
3. **Abort if:** ingest fails — the synthetic renderer is a labelled development surface, not a
   launch substitute.

**After 1.1–1.5 all pass:** swap staging credentials for PRODUCTION credentials and repeat 1.1
(one ₵1 live charge, immediately refundable) + 1.4 (one live email). Payouts/SMS/Stream verified on
staging keys with production keys only need the one-checkout-charge confirmation.

---

## Gate 2 — First production build (never compiled in development)

The dev sandbox runs the dev server only (by design); CI runs the dev stack. **`next build` has
never been executed.** On the target VPS (or a build box with the same Node/Bun majors):

```bash
bun install --frozen-lockfile
NODE_ENV=production DATABASE_URL=<staging-or-placeholder> bunx next build
```

- **Pass:** build completes; `.next/standalone/server.js` exists (the `start` script expects it).
- **If it surfaces a server/client boundary or prerender error:** this is the moment — fix in a
  round (branch → CI → merge), never hot-patch on the VPS.
- Smoke the artifact locally: `NODE_ENV=production APP_SECRET=… DATABASE_URL=… bun .next/standalone/server.js`
  → `GET /api/v1/health` healthy → **stop it** (the real serving happens in Gate 3 under systemd).

---

## Gate 3 — The deployment event (executes docs/DEPLOYMENT.md §B)

Rehearsed in pieces (embedded PG init, monitor, backup/restore all ran for real), never end-to-end
on real infrastructure. Sequence (details in DEPLOYMENT.md):

1. VPS provisioned (Ubuntu LTS, non-root user, firewall: 22/80/443 only).
2. Managed PostgreSQL created; `DATABASE_URL` points at it; `bunx prisma db push` + `bun run db:seed`
   **only if starting from the demo dataset** — for a real launch, push schema and seed ONLY the
   platform admin, then create the real organizer accounts through the admin console.
3. `APP_SECRET` = fresh 64-char random; `NODE_ENV=production` (boot guard refuses to start without
   `APP_SECRET`; simulators are refused in production — if you see a simulator warning here, stop).
4. systemd units (copy each; `WorkingDirectory` = repo checkout):

```ini
# /etc/systemd/system/ieventplux-app.service
[Unit]
Description=iEventPlux web app
After=network-online.target
[Service]
User=ieventplux
WorkingDirectory=/srv/ieventplux
Environment=NODE_ENV=production
EnvironmentFile=/srv/ieventplux/.env
ExecStart=/usr/local/bin/bun .next/standalone/server.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target

# ieventplux-worker.service  → ExecStart=/usr/local/bin/bun mini-services/worker/index.ts
# ieventplux-realtime.service → ExecStart=/usr/local/bin/bun mini-services/realtime/index.ts
# ieventplux-monitor.service  → ExecStart=/usr/local/bin/bun run ops:monitor  (loop mode)
```

5. Backup schedule (cron): `17 2 * * *  cd /srv/ieventplux && bun run ops:backup >> /var/log/ieventplux-backup.log 2>&1`
   plus an offsite copy of `backups/` and — for real scale — provider-native `pg_dump`
   (DEPLOYMENT.md §7; JSONL is portable/inspectable, pg_dump is point-in-time-capable).
6. Caddy reverse proxy + TLS (DEPLOYMENT.md §5) — never expose 3000/3001/3003 directly.

**Gate 3 pass:** all four systemd units `active (running)`; `https://<domain>/api/v1/health` healthy
with `database: up` and zero validation errors.

---

## Gate 4 — Post-deploy verification (on the production URL)

| # | Check | Pass condition |
|---|---|---|
| 4.1 | `SMOKE_BASE_URL=https://<domain>/api/v1 bun run smoke` | 11/11 — note check 10 intentionally burns a password-reset bucket; run it, then wait out the window |
| 4.2 | Golden path with REAL money | ₵1 test event → live charge → `PAID` + ticket issued + journal balanced (DEPLOYMENT.md §6) |
| 4.3 | Ops monitor cycle on prod | `bun run ops:monitor -- --once` → 4/4 UP; admin Ops Health shows the targets |
| 4.4 | Backup + RESTORE rehearsal ON PROD | `ops:backup` → restore into a scratch database on the managed PG → counts match. **A backup that has never been restored on the production environment is a hypothesis.** |
| 4.5 | Worker queue | admin Outbox: no `DEAD` jobs; `GET :3001/stats` (secret) clean |
| 4.6 | Audit trail | admin Audit shows the launch actions (org verify, event publish, test charge) |

---

## Gate 5 — Mobile on-device pass (the app has never run on real hardware)

1. `cd mobile && npx expo run:android` on a physical device (dev build — native RTMP module required
   for broadcasting; see `mobile/docs/NATIVE_MODULES.md`).
2. Verify the four core journeys **on the device, against the production URL**:
   sign-in → browse/discover → buy (Hubtel hosted checkout opens) → wallet + QR ticket renders;
   staff: roster download → scan → check-in → offline queue syncs on reconnect.
3. Store submission (Google Play / App Store): developer accounts, screenshots, privacy policy URL,
   data-safety disclosures. Store billing config required before enabling digital purchases in-app
   (physical tickets may use Hubtel hosted checkout).
4. **Abort if:** anything beyond cosmetic issues — a crash on-device is a stop-ship for mobile release
   (the web platform can launch independently of the stores).

---

## Gate 6 — Go / No-Go

**GO requires ALL of:** Gate 0 rows pass · Gate 1 all five externals verified (staging → production
swap confirmed) · Gate 2 build artifact healthy · Gate 3 four services under systemd · Gate 4 all six
checks pass on production · explicit go/no-go decision recorded by the organizer.

**Launch may proceed WITHOUT mobile stores** (web-first launch is legitimate — the mobile apps follow
when Gate 5 completes).

**Rollback (any gate):** `systemctl stop ieventplux-*` → previous release directory → restore DB from
the last verified snapshot (`ops:restore --i-know-this-wipes-live` ONLY on a stopped app) → start →
`bun run smoke`. DEPLOYMENT.md §8 has the full procedure.

---

## Standing drills (post-launch)

- **Monthly restore rehearsal:** backup → `ops:restore` into scratch → counts match → drop scratch. (R33 verified this drill works end-to-end; ~10 s on the dev dataset.)
- **Weekly monitor review:** admin Ops Health — alert trail should show only known transitions; zero open alerts.
- **After every round push:** confirm CI green before deploying the new commit.
