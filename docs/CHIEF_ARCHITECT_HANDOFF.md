# CHIEF ARCHITECT HANDOFF — iEventPlux

**To:** Chief Architect (ChatGPT independent review pass)
**From:** Principal Implementation Engineer (z.ai build)
**Product:** iEventPlux — events discovery, ticketing, social & broadcasting platform for Lightworld Technologies Ltd. (Christian Agbotah), Ghana.
**Handoff date:** 2026-11-11 · **Repo state at handoff:** see git log below.

---

## 1. Repository

- **Location:** `/home/z/my-project` (this workspace). **Remote configured and pushed:** `https://github.com/christianagbotah/ieventplux.git` (public, branch `main`, upstream tracking set).
  - Push auth: GitHub PAT stored in the git credential store **outside the repo** (`/home/z/.git-credentials`, chmod 600) — the token is never committed and a pre-push scan confirmed it appears in no tracked file.
  - Going forward, every verified milestone is committed and pushed (`git push origin main`).
  No GitHub repository was fabricated (per brief §1). Nothing outside this workspace was modified.
- **Commits (verified milestones):**
  - `5320e36` scaffold base (pre-existing)
  - `5c3b702` Stage A — data model (56 entities), core libs, Hubtel adapters + isolated dev simulator, business services, CSS effects catalog (38), synthetic poster art, dev seed
  - `17f9f31` Stages B/C — full REST API v1 (auth/elevation, events lifecycle + visibility, social, transactional orders, payments incl. simulator, tickets/QR, check-in, finance, broadcasts, promotions, subscriptions, messaging, AI, admin, OpenAPI)
  - `5962304` UI — complete portal frontend (jQuery transitions, checkout UX, organizer workspace, admin console, Effects Studio, voice concierge, realtime chat)
  - `F-final` — verification fixes (callback casing, check-in FK, jQuery easings, route conflict), mobile scaffold, documentation suite, this handoff
  - `4ca3093` — **post-handoff re-verification round 2:** voice-TTS defect fix (provider rejects `mp3`; route now `wav` + `audio/wav`, full ASR→LLM→TTS round-trip verified), footer iOS safe-area + mobile-nav clearance, `.env` untracked (template → `.env.example`), TEST_REPORT round-2 section. Working tree clean at this commit.
  - `45e08cb` — remote connected + pushed; `0d19f42`/`98e7181`/`00c0958` — production homepage polish + PWA, lint hygiene, platform-wide zero-error sweep.
  - AI + UX expansion (round 4): AI smart search (`/ai/search`), AI recommendations (`/ai/recommend`), AI Content Studio (`/ai/studio` + `/#/ai-studio` incl. poster image generation), command palette (⌘K), dark/light theme, confetti + selling-fast signals. Verified in TEST_REPORT round 3.
- **Branch:** `main` · **Working tree:** clean at handoff.

## 2. What actually runs (verified)

| # | Capability | Status |
|---|---|---|
| 1 | Public discovery with filters, sponsored placements (labelled), series, visibility rules | ✅ Runs |
| 2 | Auth: register/login/logout, sessions + revocation, password reset, contact verification, elevation for privileged finance | ✅ Runs |
| 3 | Event lifecycle with enforced transitions + attendee notifications on cancel/postpone | ✅ Runs |
| 4 | Orders with transactional inventory holds (15-min), quota invariants, buyer limits, group discounts, codes | ✅ Runs |
| 5 | Hubtel v1 checkout adapter + **isolated dev simulator** with success/failure/forged-amount/late/duplicate/no-callback scenarios; durable callbacks; idempotent fulfilment; amount verification; ≥5-min bounded reconciliation | ✅ Runs (simulator boundary) |
| 6 | Tickets: opaque codes + HMAC QR (no personal data), free- RSVP issuance, one-time transfer links | ✅ Runs |
| 7 | Check-in: camera/manual scan, duplicate + conflict preservation, offline queue w/ idempotent replay, minimized roster download | ✅ Runs |
| 8 | Balanced append-only ledger with idempotency keys; fee snapshots; org finance summary | ✅ Runs |
| 9 | Refunds: full-order path w/ ticket revocation + reversal journals; repeated-refund guard; MANUAL_TRACKED for unsupported; privileged processing behind password re-auth | ✅ Runs |
| 10 | Payouts: request→approve→submit→paid/failed with holds + reversals; provider submission externally blocked (truthful) | ✅ Runs (to boundary) |
| 11 | Subscriptions: plans, entitlement enforcement, purchase through the same payment rail, no auto-renew (documented policy) | ✅ Runs |
| 12 | Hubtel SMS adapter + simulator; consent, quiet hours, quotas, segment estimates, delivery-state truth (acceptance ≠ delivery) | ✅ Runs (simulator boundary) |
| 13 | Broadcasts: entitlements (physical≠virtual), 10-min playback tokens + heartbeats, key rotation, live chat + presence via socket.io | ✅ Runs (synthetic video, labelled) |
| 14 | Promotions: atomic CPM budgets, frequency caps, dedup telemetry, sponsored labels | ✅ Runs |
| 15 | Admin console: 12 sections incl. org verification (demoed live), payments/exceptions, sweeps run-now, integration health | ✅ Runs |
| 16 | AI concierge: text + real-time voice (ASR→LLM→TTS) with real DB event context; nonessential, disableable | ✅ Runs |
| 17 | CSS Effects Studio: 38 live demos + copyable code (user-requested feature) | ✅ Runs |
| 18 | Mobile: Expo source scaffold (screens for discover/buy/tickets/QR/check-in) | ⚠️ Source only — not built/device-tested |

## 3. Demo routes & accounts (dev seed; password `Dev@12345` — DEV ONLY)

- `#/` discovery → `#/event/accra-gospel-night-of-wonders` (buy flow) → simulator → `#/order/{ref}` → `#/me?tab=tickets` (QR)
- `#/effects` Effects Studio · `#/live` + `#/broadcast/{id}` live/replay · `#/reels`
- `#/organizer` workspace (pastor@lightworld.dev) · `#/admin` console (admin@ieventplux.dev; finance@ for refunds w/ elevation)
- Accounts table in `README.md`; full demo journeys listed there too.

## 4. Architecture decisions worth review

1. **Single-page hash router at `/` + REST API routes** — the delivery gateway exposes exactly one user-visible page; all screens are client views over `#` routes. API routes are versioned `/api/v1` with OpenAPI. Documented in ARCHITECTURE (adaptation table).
2. **SQLite + DB-backed outbox instead of PostgreSQL + Redis/BullMQ** — sandbox constraint; schema and queue semantics are portable (documented migration path). SQLite WAL + busy_timeout for the two-process setup; writer serialization is the concurrency ceiling (see TEST_REPORT note).
3. **Modular monolith in Next.js route handlers** rather than NestJS — same layering (routes → services → adapters), thinner deployment surface for this environment.
4. **Payment authority model** — browser returns are informational; only callbacks (stored durably, deduplicated) or authenticated reconciliation change money state; amounts compared against the attempt; no invented HMAC (v1 contract has none — documented); case-tolerant field parsing after a real defect was found in verification.
5. **Simulator isolation** — dev simulators for payments/SMS run only without credentials and are refused under `NODE_ENV=production`; they exercise the true fulfilment pipeline with the provider boundary simulated and labelled.
6. **Ledger-first money design** — every money effect is a balanced journal with an idempotency key; refunds/payouts post reversals; settled history is never edited.
7. **Entitlement split** — entry vs online viewing vs replay are distinct; a physical ticket unlocks virtual only when its product says so.

## 5. Implemented / incomplete / blocked

**Implemented and locally verified:** items 1–17 above (see TEST_REPORT E1–E14).

**Incomplete (partial):**
- Phone-camera RTMP publishing (web studio shows preview + health only; needs native dev build — see mobile/docs/NATIVE_MODULES.md).
- Concurrent-session controls and adaptive bitrate are modelled but delivery-level features depend on the real video provider.
- Series editing offers occurrence-level editing; "apply to future occurrences" bulk-edit UI is not built.
- In-memory rate limiting (per-instance) — swap for a shared store when scaling out.
- Automated test suite (jest/Playwright) — replaced this pass by scripted verification (TEST_REPORT); add before scale.

**Externally blocked (needs credentials/contracts, truthfully labelled in Admin → Integrations):**
- Hubtel Checkout sandbox/live verification (credentials + endpoint re-verification against current docs).
- Hubtel Send Money (payout submission) + merchant agreement.
- Hubtel SMS live delivery + approved sender ID.
- Cloudflare Stream (ingest/playback/recordings + pricing confirmation).
- SMTP relay for live email.
- Apple/Google developer accounts for native store billing (physical tickets may use Hubtel; digital-only purchases must use store billing once configured).
- No git remote configured for this workspace.

**Known defects at handoff:** none open — the four found during verification (callback casing, check-in FK on forged QR, jQuery easing crash, `[id]/[slug]` route conflict) were fixed and re-verified.

## 6. Verification commands (reproduce the evidence)

```bash
bun install && bun run db:push && bun run db:seed
bun run dev &            # :3000
(cd mini-services/realtime && bun install && bun run dev &)   # :3003
(cd mini-services/worker && bun run dev &)                    # :3001

bunx tsc --noEmit        # 0 errors
bun run lint             # 0 errors
curl -s localhost:3000/api/v1/health | jq .status            # healthy

# Money-critical invariants:
#  - buy 2 VIP via simulator "Approve payment" → order PAID + 2 tickets + balanced journal
#  - "Send forged amount callback" → REJECTED, order unpaid
#  - "Pay twice" → single fulfilment
#  - "Walk away" → stays unresolved; reconciliation → UNKNOWN after 6 checks
#  - scan TKT-… twice → ADMITTED then DUPLICATE
# Ledger balance check: DR total == CR total per journal (orgFinanceSummary + Admin → ledger)
```

Browser walkthrough: follow README "Demo journeys" 1–8.

## 7. Honest completion assessment

This is a **working, end-to-end development build** of the full product surface — not a production-ready claim. All core workflows (discovery → paid/free ticketing → QR admission → ledger/refunds/payouts → broadcasting entitlements → moderation/admin → AI concierge) execute against the real database and queue infrastructure, with the provider boundaries (payments, SMS, video, email) either adapter-ready-and-blocked or exercised through clearly-isolated simulators. Native mobile is source-only. Provider endpoint contracts must be re-verified against current official documentation when credentials arrive, and the automated test/CI layer plus load testing remain to be built before any scale launch.

**Status table**

| Area | State |
|---|---|
| Web portal + API + worker + realtime | ✅ Running, browser-verified |
| Data model (56 entities) + seed | ✅ |
| Payments (Hubtel v1 adapter + simulator) | ✅ logic · ⚠️ provider unverified (no credentials) |
| SMS (Hubtel adapter + simulator) | ✅ logic · ⚠️ provider unverified |
| Payouts / Send Money | ✅ workflow · ⛔ provider blocked |
| Live video (Cloudflare Stream) | ✅ entitlements · ⛔ delivery blocked → labelled synthetic |
| Mobile (Expo source) | ⚠️ scaffold, not device-tested |
| Tests | ⚠️ scripted verification (E1–E14); automated suite deferred |
| Docs | ✅ full suite incl. traceability, test report, deployment, this handoff |
| Git | ✅ `main` pushed to `github.com/christianagbotah/ieventplux` (PAT outside repo) |
