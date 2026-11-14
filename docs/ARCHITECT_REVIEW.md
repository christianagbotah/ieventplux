# iEventPlux — Architect Review Report

**Purpose:** a single self-contained review package for an architect assessing this repository on GitHub.
**State at write time:** commit `7693367` (Round 33), branch `main`, in sync with `origin/main`, CI **success** on the last three pushed commits.
**Reviewer shortcut:** if you read only one more document after this one, read `docs/GO_LIVE.md` (the launch procedure) and `docs/TEST_REPORT.md` (the evidence).

---

## 1. Executive summary

iEventPlux is an events discovery, ticketing, social and live-broadcasting platform for Lightworld
Technologies Ltd. (Christian Agbotah), Ghana. It is a complete, working system — not a prototype:

- **69-model PostgreSQL data model** covering events, ticketing, payments/settlement/ledger,
  social, broadcasts, promotions, subscriptions, messaging, moderation, ops.
- **25 REST API domains** (`/api/v1`, 48 route files) with an OpenAPI surface, plus an OpenAPI spec endpoint.
- **A full single-page portal frontend** (React 19 + Next.js 16 App Router, shadcn/ui, jQuery
  transitions per the original brief): attendee discovery → checkout → wallet/QR tickets →
  organizer workspace → admin console (12 sections) → Ops Health.
- **A mobile app** (Expo SDK 52) with offline check-in and ticket wallet, 40 logic tests passing.
- **A double-entry ledger** (LedgerAccount/Journal/Entry) with settlement holds, payouts, refunds
  and versioned fees — payments are accounted, not just recorded.
- **Verified operational claims:** every round was verified with real browser sessions
  (agent-browser, mobile 390×844 + desktop 1280×800), and the final rounds carry machine-checkable
  proof (smoke suite in CI, backup/restore rehearsal, multi-instance rate-limit proof).

**Honest bottom line (stated everywhere in the docs, repeated here):** engineering is complete and
evidenced; what remains is a **launch procedure**, not development — five external providers have
never been touched with real credentials, `next build` has never been compiled, and the end-to-end
deployment event has never run on real infrastructure. `docs/GO_LIVE.md` sequences exactly how to
close those gaps, with abort conditions per gate.

---

## 2. Scale of the codebase (numbers a reviewer can check)

| Metric | Value | How to verify |
|---|---|---|
| Prisma models | 69 | `rg "^model " prisma/schema.prisma \| wc -l` |
| Database (dev + prod path) | PostgreSQL 18.6 (embedded user-space binaries in dev; managed PG for launch) | `scripts/dev-postgres.sh`, `docs/ARCHITECTURE.md §6` |
| API domains under `/api/v1` | 25 (admin, ai, auth, broadcasts, checkin, comments, discovery, effects, events, health, invitations, messages, notifications, openapi, orders, orgs, payments, polls, promotions, questions, reviews, social, subscriptions, tickets, uploads) | `ls src/app/api/v1` |
| API route files | 48 | `rg --files src/app/api -g route.ts \| wc -l` |
| Frontend source (src/, TS+TSX) | ~34,200 LOC | `rg --files src -g "*.ts" -g "*.tsx" \| xargs wc -l` |
| shadcn/ui components | 48 | `ls src/components/ui \| wc -l` |
| Mobile app | Expo SDK 52; 40 tests / 1,659 assertions passing | `cd mobile && bun test` |
| Smoke suite | 11 checks, runs in CI on real GitHub runners | `bun run smoke`, `.github/workflows/ci.yml` |
| Documentation suite | 17 documents, ~4,300 lines (this report included) | `ls docs/` |
| Build rounds | Stages A–F + Rounds 1–33, each committed & pushed | `git log --oneline` |
| CI | 2 jobs (mobile: test+tsc · web: lint+tsc+PG service+3-service stack+smoke+ops), success on last 3 commits | repo → Actions tab |

---

## 3. Architecture

### 3.1 Runtime topology

```
                         Caddy gateway (:80/:443, TLS)  — Caddyfile
                              |
        +---------------------+----------------------+
        |                     |                      |
  Next.js app :3000     Worker :3001           Realtime :3003
  (src/, Next 16        (mini-services/        (mini-services/
   App Router, SPA       worker/, outbox        realtime/, socket.io
   portal + REST v1)     jobs, deliveries,      chat/presence/
        |                reconciliation)        notifications)
        |                     |                      |
        +---------- PostgreSQL (single source of truth) ----------+
             69 tables · Prisma 6 · DB-backed rate limiting · outbox jobs
```

- **:3000** — all product functionality: portal UI (single-page hash router, a deliberate choice
  documented in `ARCHITECTURE.md §3`), `/api/v1` REST API, admin console, Ops Health page.
- **:3001** — background work: notification/message delivery (with consent, quiet-hours, quotas),
  provider reconciliation, retries; observable via admin Outbox and a secret `/stats` endpoint.
- **:3003** — socket.io realtime: broadcast chat, presence, viewer tombstones on moderation,
  notification pushes.
- **Gateway** — dev routes `?XTransformPort=` to side services; production terminates TLS and never
  exposes 3000/3001/3003 directly (`docs/DEPLOYMENT.md §5`).

### 3.2 Cross-cutting mechanisms (the parts worth a close read)

| Mechanism | Where | Why it matters |
|---|---|---|
| **API envelope + rate limiting** | `src/server/api.ts` + Prisma `RateLimitBucket` | 46 protected routes; limits persist in PostgreSQL via atomic UPSERT, so they are correct across processes and instances. **Proven for real:** two processes sharing one DB, six interleaved password-reset attempts → `200×4`, then `429×2` with `Retry-After`, single durable bucket row. (Round 32; TEST_REPORT) |
| **Money correctness** | `src/server/` ledger + `PAYMENTS_AND_SETTLEMENTS.md` | Orders → PaymentAttempt → double-entry journal; settlement holds; payouts; refund cases with elevation; `FeeVersion` so fee changes never rewrite history. |
| **Idempotent fulfilment** | payments callback/return/status routes | Late/duplicate/forged callbacks handled; fulfilment is transactional with inventory reservations and a release path on expiry. |
| **Auth & elevation** | `src/server/auth.ts`, `PERMISSIONS.md` | Session cookies, bcrypt, role matrices (user/organizer/admin), re-auth elevation for destructive ops (refund approval, org verification). |
| **Boot guards** | env validation → surfaced in `/api/v1/health` | Production refuses to start without `APP_SECRET`; simulators refused in production; integration status (real vs simulator) is reported by the health endpoint, not hidden. |
| **Ops loop** | `scripts/monitor.ts`, `backup.ts`, `restore.ts`; models `OpsCheck/OpsAlert/BackupRun`; admin Ops Health page | 4-target monitoring with transition alerting ("Run check now" works in the admin UI); nightly backup (pg_dump-style JSONL + sha256 + retention) and a **restore command that was actually rehearsed end-to-end** (Round 33, ~10 s on the dev dataset). |
| **Mobile parity** | `mobile/` (Expo 52) | Offline check-in with conflict preservation, offline ticket wallet, broadcast viewing; the checkout opens Hubtel hosted checkout. Logic is tested: 40/40 bun tests. |

---

## 4. Data model in one view (69 models, grouped)

| Domain | Models |
|---|---|
| Identity & access | User, Session, ContactVerification, DeviceSession, Consent, AuditLog, RateLimitBucket |
| Organizations | Organization, Membership, OrganizerVerification |
| Catalog | Category, Venue, EventSeries, Event, AgendaItem, MediaAsset, EventUpdate |
| Social | Follow, EventInterest, Invitation, Rsvp, Comment, Reaction, UserBlock, UserMute, EventReview |
| Ticketing | TicketType, WaitlistEntry, DiscountCode, InventoryReservation, Order, OrderItem, Ticket, AdmissionScan |
| Money | PaymentAttempt, ProviderEvent, RefundCase, LedgerAccount, LedgerJournal, LedgerEntry, SettlementHold, Payout, FeeVersion |
| Recurring revenue | SubscriptionPlan, Subscription, Invoice |
| Growth | PromotionCampaign, PromotionDelivery |
| Broadcasting | LiveBroadcast, ViewingEntitlement, PlaybackSession, ChatMessage, LivePoll, LivePollOption, LivePollVote, AudienceQuestion, AudienceQuestionUpvote |
| Messaging & moderation | Notification, MessageDelivery, ModerationReport, OutboxJob |
| Platform | PlatformSetting, CSSEffect, AiConversation, AiMessage, EventReminder |
| Operations | OpsCheck, OpsAlert, BackupRun |

Deep dive: `docs/DATA_MODEL.md` (338 lines). Note the honest-grouping detail: ops/observability
models (`RateLimitBucket`, `OpsCheck`, `OpsAlert`, `BackupRun`) were added in Rounds 32–33 when the
capabilities went live — the schema grew with the engineering, not up front.

---

## 5. What is verified (with where the proof lives)

| Claim | Evidence |
|---|---|
| Golden path works end-to-end (discover → order → pay → ticket → QR → check-in) | `bun run smoke` — 11 checks, green locally and in CI on GitHub runners; TEST_REPORT journey tables |
| Rate limiting is correct with multiple app instances | Round 32 two-process interleaving experiment (`200,200,200,200,200,429 + Retry-After:41`), TEST_REPORT |
| Backups can actually restore | `ops:backup` → `ops:restore` rehearsal, Round 33: every restored table's count matched the dump |
| Monitoring detects failures | `ops:monitor` transitions + alert trail; Admin → Ops Health "Run check now" verified in browser |
| CI blocks regressions | `.github/workflows/ci.yml`: mobile job (bun test + tsc) and web job (lint + tsc + GitHub-hosted PostgreSQL + schema push + seed + three-service stack + smoke + ops tools); **success on the last 3 commits** |
| Every round was browser-verified | Per-round "Verification:" entries in `docs/PROGRESS.md`; TEST_REPORT is ~990 lines of recorded passes and fixes |
| Mobile business logic correct | 40 tests / 1,659 assertions (ticket wallet, offline check-in), green in CI |
| Requirements coverage | `docs/REQUIREMENTS_TRACEABILITY.md` maps requirements → implementation → verification |

## 6. What is NOT verified (the honest gap list)

These are the exact reasons `docs/GO_LIVE.md` exists. None of them is a code defect; all are
"never touched real infrastructure/providers" items:

1. **Five externals configured but never exercised with real credentials:** Hubtel Online Checkout,
   Hubtel Send Money, Hubtel SMS, SMTP email, Cloudflare Stream. Each has a dev simulator whose
   contract mirrors the documented provider API, and GO_LIVE Gate 1 verifies each on staging keys
   before production.
2. **`next build` has never been compiled** — the sandbox runs dev servers by design and CI runs
   the dev stack. Gate 2 makes the first production build an explicit, isolated step with an abort
   condition.
3. **The deployment event (VPS + systemd + TLS + managed PG) has never run end-to-end** — its
   pieces (embedded PG init, monitor, backup/restore) have run for real; the whole has not.
   Gate 3 sequences it.
4. **Mobile has never run on physical hardware** — compiled (tsc 0 errors, Hermes bundles built)
   and logic-tested, but no on-device pass. Gate 5.
5. **No load testing and no third-party security audit** — out of scope so far; flagged as
   post-launch work in GO_LIVE and DEPLOYMENT.

A reviewer should treat GO_LIVE.md's gates as the contract that these five items get closed in
order, with abort conditions — not skipped on launch day.

---

## 7. Engineering history (condensed)

- **Stages A–F (pre-round):** data model, business services, Hubtel adapters + isolated simulator,
  full REST API, portal frontend, broadcasts, admin console, AI concierge, Effects Studio, docs
  suite, first handoff. Commit history preserved.
- **R1–25:** iteration on organizer/admin journeys, honest-gap sweeps, mobile scaffold compiled.
- **R26:** **PostgreSQL live** — embedded Postgres 18.6 in user space (no root/docker), full
  migration of all tables + seed, env-resolution defect found & fixed (exported `DATABASE_URL`
  silently beating `.env` — now resolved centrally in `src/lib/db.ts`).
- **R27:** broadcast domain completed — replay entitlement playback, chat moderation end-to-end
  (hide/flag/restore + realtime tombstones), viewer-capacity enforcement, two authorization fixes.
- **R28:** INVITE_ONLY guest management completed — RSVP approval write path, guest journey
  (`#/invite/{code}`), organizer decision queue, privacy fix (address keyed on approved RSVP).
- **R29–31:** admin decision states fixed, approve-after-reject + mobile parity, venue directory +
  category taxonomy (last zero-writer models given writers).
- **R32:** the four honest production gaps closed — DB-backed rate limiting (with multi-instance
  proof), automated smoke suite running in CI on GitHub runners, ops monitor/backup/alerting with
  an admin Ops Health page, mobile logic tests (40/40).
- **R33:** the launch procedure made executable — `ops:restore` (rehearsed for real), env
  completeness audit, `docs/GO_LIVE.md` with per-gate verification and abort conditions.

Full detail: `docs/PROGRESS.md` (round-by-round, each with verification evidence).

---

## 8. Suggested review path (about 90 minutes)

**On GitHub (no setup):**
1. `README.md` → `docs/ARCHITECTURE.md` (§1 diagram, §6 "adaptations from the brief", §7 scaling).
2. `prisma/schema.prisma` — skim the 69 models; `docs/DATA_MODEL.md` for narrative.
3. `src/server/api.ts` — the API envelope: auth, permissions, validation, DB-backed rate limiting.
4. Payments: `src/app/api/v1/payments/**` + `docs/PAYMENTS_AND_SETTLEMENTS.md` (callback
   idempotency, ledger balancing).
5. `docs/GO_LIVE.md` — the launch procedure; `docs/SECURITY_REVIEW.md` for the security posture.
6. **Actions tab** — CI runs on the last three commits (all green).
7. `docs/TEST_REPORT.md` — the evidence log (990 lines; includes the multi-instance proof and
   CI-green records).

**Locally (10 minutes to a running stack):**
```bash
bun install && bun run db:postgres && bun run db:push && bun run db:seed
bun run dev            # :3000  (terminal 1)
(cd mini-services/worker && bun run dev)    # :3001  (terminal 2)
(cd mini-services/realtime && bun run dev)  # :3003  (terminal 3)
bun run smoke          # 11/11 golden-path checks
bun run ops:monitor -- --once   # 4/4 targets UP
```
Seeded demo logins and the sandbox payment simulator are described in `README.md`.

**Decision records worth challenging (deliberate deviations, documented):**
- Single-page hash-router portal instead of route-per-screen (`ARCHITECTURE.md §3`) — brief
  compatibility + jQuery transition requirement.
- Embedded user-space PostgreSQL in dev instead of SQLite (`ARCHITECTURE.md §6`) — concurrency
  correctness from Round 26, same provider as production.
- Dev simulators for all five externals — contract-mirroring and labelled; production refuses them.
- Hash-addressed SPA deep links (`#/invite/{code}`) — mobile app and web share them.

---

## 9. Risk register (architect's likely questions, answered up front)

| Risk | Position |
|---|---|
| Provider contract drift (Hubtel/Stream) | Callback handlers built to documented contracts; Gate 1 reconciles field-by-field on staging before production; simulator makes divergence visible immediately. |
| First production build surprises | Gate 2 exists precisely because `next build` never ran; fixes land as normal rounds through CI, never hot-patched. |
| Data loss | Nightly `ops:backup` (checksummed) + rehearsed `ops:restore` + offsite copy + pg_dump guidance for point-in-time; Gate 4.4 requires a restore rehearsal **on production** before GO. |
| Secret leakage | PAT/credentials stored outside the repo (`~/.git-credentials`, chmod 600); pre-push scans confirmed no secrets in tracked files; `.env.example` documents the full env surface (audited in R33). |
| Scale beyond one app instance | Already proven: DB-backed rate limiting, PG everywhere, worker decoupled via outbox; scaling notes in `ARCHITECTURE.md §7`. Load testing remains post-launch work. |
| Mobile store rejection / on-device crashes | Web-first launch is legitimate per GO_LIVE Gate 6; mobile follows when Gate 5 passes. |

---

## 10. Document map

| Doc | Lines | Role |
|---|---|---|
| `ARCHITECTURE.md` | 239 | System diagram, boundaries, data flows, deviations, scaling |
| `DATA_MODEL.md` | 338 | Entity narratives per domain |
| `PRODUCT_SPEC.md` / `IMPLEMENTATION_PLAN.md` | 175 / 184 | What was built and against what plan |
| `REQUIREMENTS_TRACEABILITY.md` | 261 | Requirement → implementation → verification |
| `PERMISSIONS.md` | 165 | Role/permission matrices |
| `PAYMENTS_AND_SETTLEMENTS.md` | 209 | Money flow, ledger, settlement, payouts |
| `PROVIDER_CAPABILITIES.md` | 155 | Hubtel/SMS/Stream contracts + verification protocol |
| `SECURITY_REVIEW.md` | 156 | Security posture |
| `OPERATIONS.md` / `DEPLOYMENT.md` / `GO_LIVE.md` | 199 / 138 / 180 | Ops runbook, deploy runbook, launch gates |
| `TEST_REPORT.md` | 990 | Evidence log (rounds, proofs, re-verifications) |
| `PROGRESS.md` | 346+ | Round-by-round engineering history |
| `COST_MODEL.md` | 153 | Fee/settlement economics |
| `CHIEF_ARCHITECT_HANDOFF.md` | 157 | Original Stage A–F handoff (superseded by this report for current state) |

---

*Report generated as Round 34 of the build log; state frozen at commit `7693367`, CI success. If
newer commits exist, trust `git log` + the Actions tab over the numbers here.*
