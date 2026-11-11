# iEventPlux — Implementation Plan & Stage Record

| | |
|---|---|
| **Purpose** | Maps the brief's stages A–F (`upload/iEventPlux_ZAI_Master_Build_Prompt.md` §22) to what was actually built, with file pointers and acceptance-check status, then lists remaining work honestly. |
| **Companion evidence** | `docs/TEST_REPORT.md` (scripted browser/API verification of the brief's acceptance cases — written separately by the lead) |

---

## Stage A — Architecture, schema, auth, tenancy, permissions, API contracts, design system

**Status: complete.**

| Deliverable | Files | Acceptance check |
|---|---|---|
| Architecture decision record + system diagram | `docs/ARCHITECTURE.md` (this suite), `Caddyfile`, gateway routing | ✅ one origin; `?XTransformPort` routing verified for :3003 (socket.io) and :3001 (health) |
| Schema (56 models, integer money, IANA timezones) | `prisma/schema.prisma` (1 156 lines) | ✅ `prisma db push` clean; models enumerated in `docs/DATA_MODEL.md` |
| Custom auth: bcrypt + hashed session tokens | `src/server/auth.ts` | ✅ sign-in/register/sign-out; 14-day TTL; HttpOnly cookie; revocation on password reset |
| Tenancy: orgs, memberships, soft delete | `src/server/permissions.ts`, `Organization`/`Membership` models | ✅ membership proven from session; caller-supplied org ids never authorize |
| Permission matrices | `src/server/permissions.ts` (documented in `docs/PERMISSIONS.md`) | ✅ platform + org matrices exercised |
| API contracts | `src/app/api/v1/**` + `GET /api/v1/openapi` | ✅ versioned namespace; stable error codes; correlation ids |
| Design system | Tailwind CSS 4 + shadcn/ui (`src/components/ui/*`), emerald/amber palette | ✅ no indigo/blue in the palette; consistent portal styling |
| Typed env + truthful degradation | `src/server/env.ts`, `.env.example` | ✅ boot-critical failures; feature-level warnings; simulator refusal in production |

## Stage B — Event publishing, discovery, private invitations, social, organizer workspace

**Status: complete.**

| Deliverable | Files | Acceptance check |
|---|---|---|
| Event lifecycle DRAFT→SCHEDULED→PUBLISHED→POSTPONED/CANCELLED→LIVE→ENDED | `src/server/services/events.ts`, worker `EVENT_LIFECYCLE` | ✅ transitions incl. scheduled publication and auto-END with +30 min grace |
| Visibility PUBLIC/UNLISTED/INVITE_ONLY | `services/events.ts`, discovery routes | ✅ UNLISTED excluded from discovery+search+feeds; INVITE_ONLY hides address until approved RSVP |
| Invitations (codes, guest limits, approval) | `Invitation`/`Rsvp` models, `/api/v1/invitations/[code]` | ✅ seeded invite-only event demonstrates the flow |
| Series + occurrences, agenda, venues | `EventSeries`, `AgendaItem`, `Venue` | ✅ 4 recurring series seeded |
| Organizer updates → ticket holders | `EventUpdate` + notify path | ✅ notification + queued SMS |
| Discovery feed, categories, search, city filter | `src/portal/views/Discover.tsx`, `/api/v1/discovery/[view]` | ✅ feed + search + live-now rail |
| Social: follows, save/interest/going, comments, reactions | `/api/v1/social/[action]`, models in `DATA_MODEL.md` §1.3 | ✅ privacy rules enforced (interest private) |
| Reels feed | `src/portal/views/Reels.tsx` | ✅ synthetic dev clips (poster Ken Burns), honestly labelled |
| Reports/block/mute | `ModerationReport`, `UserBlock`, `UserMute` | ✅ admin moderation queue consumes reports |
| Organizer workspace | `src/portal/views/OrganizerWorkspace.tsx` (1 691 lines) | ✅ events, ticket types, orders, attendees, finance, messaging, broadcasts, billing tabs |
| Publish gating: paid tickets need ACTIVE org verification | `services/events.ts` | ✅ unverified org cannot publish paid events (seeded pending org demonstrates) |

## Stage C — Inventory, orders, Hubtel adapter, QR tickets, check-in, ledger, refunds, payouts, subscriptions, SMS

**Status: complete (Hubtel adapter implemented; sandbox verification pending credentials).**

| Deliverable | Files | Acceptance check |
|---|---|---|
| Transactional reservations (15 min), quota invariants | `src/server/services/ordering.ts` | ✅ sold+reserved≤quota re-checked in-transaction; sweep releases expiry |
| Orders + per-buyer limits + group discounts + codes | `services/ordering.ts`, `DiscountCode` | ✅ limits enforced; single code per order; server-side pricing only |
| Hubtel v1 Online Checkout adapter | `src/server/hubtel/payments.ts` | ✅ initiate/callback/status implemented per contract; case-tolerant parsing; no invented HMAC; **not sandbox-verified** |
| Payment orchestration + callback intake | `src/server/services/payments.ts` | ✅ prompt ack, dedup, worker processing |
| Idempotent fulfilment + exception routing | `src/server/services/fulfilment.ts` | ✅ duplicate-success → RefundCase; late-success → re-reserve or exception; free RSVP path |
| Dev payment simulator (6 scenarios) | `/api/v1/payments/simulator/[reference]` | ✅ success/failure/forged-amount/late-success/duplicate-callback/pending-forever; refused in production |
| Reconciliation (5-min gate, ≤6 checks) | `services/payments.ts`, `settings.ts` | ✅ UNKNOWN routing; never re-charge |
| QR tickets (opaque codes + HMAC, no PII) | `src/server/qr.ts`, `ids.ts` | ✅ `IEVX1.{id}.{hmac}` payload; server-side recompute at scan |
| Transfers via one-time claim tokens | `/api/v1/tickets/transfer/[token]`, `src/portal/views/ClaimTicket.tsx` | ✅ single-use claim flow |
| Check-in: scan, manual lookup, duplicates, offline sync | `src/server/services/checkin.ts` | ✅ `clientScanId` idempotency; OFFLINE_SYNC conflicts preserved as CONFLICT; minimized device rosters |
| Balanced append-only ledger | `src/server/ledger.ts` | ✅ 9 account codes; DR=CR enforced; idempotency keys; reversals |
| Refunds (full-order MoMo; MANUAL_TRACKED otherwise) | `src/server/services/refunds.ts` | ✅ elevation-gated processing; ticket revocation precedes reversal |
| Payouts (lifecycle, holds, reversal, same-reference retry) | `services/refunds.ts` (payout section) | ✅ Send Money submission externally blocked and recorded |
| Subscriptions (BASIC/PRO/ORG, entitlements, grace, cancel) | `src/server/services/subscriptions.ts` | ✅ backend-enforced caps; invoice+attempt+activation journal; **no auto-renew (documented)** |
| Fee versioning + snapshots | `src/server/fees.ts`, `FeeVersion` | ✅ per-order snapshot; admin versioning console |
| Hubtel SMS adapter + simulator | `src/server/hubtel/sms.ts` | ✅ send + delivery-state poll; ACCEPTED≠DELIVERED; segment estimation; **not sandbox-verified** |
| Messaging consent/quota/quiet hours | `/api/v1/messages/[action]`, `jobs/handlers.ts` | ✅ consent registry, 20–08 quiet hours, monthly quota, GSM-7/UCS-2 estimation pre-send |

## Stage D — Broadcasting, protected playback, phone publishing

**Status: complete except live provider (externally blocked) and device-verified phone publishing.**

| Deliverable | Files | Acceptance check |
|---|---|---|
| LiveBroadcast + access policies FREE/PAID/TICKET_HOLDERS/INVITED | `src/server/services/broadcasts.ts` | ✅ entitlement resolution per policy |
| ViewingEntitlement kinds (physical-only tickets never unlock virtual) | `services/broadcasts.ts`, `resolveEntitlement` | ✅ TICKET_BENEFIT only for virtual-access tickets |
| Short-lived playback tokens (10-min TTL, heartbeat, revocation) | `services/broadcasts.ts`, `PLAYBACK_CLEANUP` sweep | ✅ hashed tokens; revocation at broadcast end; stale-session cleanup |
| Stream key rotation | `services/broadcasts.ts` `rotateStreamKey` | ✅ organizer-only, keys shown once |
| Synthetic stream renderer (Cloudflare Stream blocked) | `src/portal/components/PlayerSim.tsx` | ✅ clearly labelled; entitlement-gated |
| Studio: getUserMedia preview + input health; OBS/vMix keys | `src/portal/views/BroadcastView.tsx` | ✅ ingest keys shown once; documented RTMP targets |
| Phone-camera RTMP publishing | documented only | ⚠️ requires native dev builds — **not verified on device** (recorded exclusion) |
| Chat + presence (realtime service) | `mini-services/realtime/index.ts`, chat API | ✅ rooms `broadcast:{id}`; relay authorization in API |

## Stage E — Promotions, administration, accessibility, operational reporting

**Status: complete; native Android/iOS not built (web-first adaptation).**

| Deliverable | Files | Acceptance check |
|---|---|---|
| Promotion campaigns: budget/spent atomic, CPM billing, caps, dedup telemetry | `src/server/services/promotions.ts` | ✅ budget can't be exceeded; spend journals; "Sponsored" labels |
| Admin console (12 sections + ops sub-sections) | `src/portal/views/AdminConsole.tsx`, `/api/v1/admin/[...sections]` | ✅ overview/orgs/events/moderation/payments/refunds(elevated)/payouts/fees+plans/integrations/sms/audit/operations + users/outbox/settings/categories/ledger |
| Integrations health with truthful stages | `src/server/env.ts` `integrationStatuses()` | ✅ implemented / sandbox-verified / live-verified / externally-blocked per integration |
| Operations sweeps run-now | `jobs/handlers.ts` `sweepOnce` | ✅ reconcile/reservations/reminders/lifecycle/sms |
| AI concierge (text + voice) | `/api/v1/ai/[mode]`, `VoiceAssistant.tsx` | ✅ real DB context; disable flag `AI_CONCIERGE_ENABLED` |
| CSS Effects Studio (user-requested) | `src/data/css-effects.ts`, `src/portal/views/EffectsStudio.tsx` | ✅ 38 effects / 10 categories, live demos + copyable code |
| Accessibility | semantic shadcn/ui primitives, focus states, labels | ✅ reasonable web baseline; **no formal audit performed** |
| Operational reporting | admin overview + org finance summaries | ✅ aggregates from ledger/orders/refunds/payouts |

## Stage F — Integration verification, defect fixes, deployment rehearsal, handoff

**Status: code-complete and locally verified; external verification blocked by credentials.**

| Deliverable | Status |
|---|---|
| Lint + typecheck clean | ✅ `eslint .` and `tsc` pass |
| Brief acceptance cases exercised | ✅ via scripted browser/API verification — evidence in `docs/TEST_REPORT.md` (no jest/vitest suite; recorded as an honest deviation) |
| Dev seeds exercising every notable path | ✅ 14 users, 4 orgs (1 pending verification), 19 events (series ×4, unlisted, invite-only, live now, ended w/ replay), 5 orders (3 fulfilled, 1 pending→UNKNOWN via reconciliation, 1 free RSVP), refunds + payout demo cases, campaign with telemetry — `prisma/seed.ts`, password `Dev@12345` |
| Health endpoint surfacing integration stages | ✅ `GET /api/v1/health` |
| Deployment rehearsal | ✅ local topology (app + worker + realtime + Caddy) starts and serves; production deployment not performed (no target host) |
| Sandbox verification | ❌ **blocked — no provider credentials in this environment** |
| Chief-architect handoff docs | ✅ this docs suite (`PRODUCT_SPEC`, `ARCHITECTURE`, `DATA_MODEL`, `PERMISSIONS`, `PAYMENTS_AND_SETTLEMENTS`, `PROVIDER_CAPABILITIES`, `SECURITY_REVIEW`, `OPERATIONS`, `COST_MODEL`, `IMPLEMENTATION_PLAN`) |

---

## Remaining work (honest, ordered)

1. **Sandbox verification with credentials (blocking for go-live money flows).**
   - Hubtel checkout: re-verify `POST /items/initiate` and status-check endpoints against `https://code.hubtel.com/docs/guides/online-checkout` with sandbox keys; run the six simulator scenarios against the real sandbox.
   - Hubtel SMS: verify send + delivery-state polling against `https://code.hubtel.com/docs/guides/sms-delivery`; confirm approved sender ID.
   - Hubtel refunds: verify the refunds guide flow; replace `MANUAL_TRACKED` auto-routing with the verified endpoint if eligible.
   - Hubtel Send Money: credentials + merchant agreement; then sandbox-verify submission + reconciliation before enabling PAID transitions.
2. **Native builds.** React Native/Expo dev builds for Android/iOS; verify phone-camera RTMP publishing on device; store submission rules (Apple/Google digital-purchase compliance) reviewed before any in-app purchase path is added.
3. **PostgreSQL migration.** Swap `DATABASE_URL`, `prisma migrate`, re-run verification; replace the platform-account NULL-guard with a partial unique index; load-test write concurrency.
4. **External ad connectors** (if promoted placements beyond on-platform sponsorship are wanted) — current promotions are first-party only.
5. **Load testing.** No performance numbers exist today; concurrency targets (buyers/sec at on-sale, chat fan-out, scan rate at doors) must be measured before capacity claims.
6. **Horizontal scale prerequisites.** Move in-memory rate limiting to a shared store; add socket.io Redis adapter if multiple realtime nodes are deployed.
7. **Formal accessibility audit** of the portal.
8. **Test suite formalization** — port the scripted verification into an automated suite (jest/vitest or Playwright) once a CI runner is available.

## Requirement-to-stage coverage matrix

Brief section → stage → implementation evidence (files + docs):

| Brief § | Topic | Stage | Implementation |
|---|---|---|---|
| 2 | Purpose & market | A | `docs/PRODUCT_SPEC.md` §1 |
| 3 | Architecture | A | `docs/ARCHITECTURE.md` (+ §6 adaptations) |
| 4 | Accounts/orgs/isolation | A | `auth.ts`, `permissions.ts`, `docs/PERMISSIONS.md` |
| 5 | Frontend quality/screens | A–B | `src/portal/**` (14 views), shadcn/ui emerald/amber |
| 6 | Event lifecycle | B | `services/events.ts`, worker `EVENT_LIFECYCLE` |
| 7 | Discovery & social | B | discovery routes, social routes, AI concierge (`/api/v1/ai/[mode]`) |
| 8 | Inventory/orders/admission | C | `services/ordering.ts`, `services/checkin.ts`, `qr.ts` |
| 9 | Hubtel payments | C | `hubtel/payments.ts`, `services/payments.ts`, `services/fulfilment.ts` |
| 10 | Ledger/refunds/payouts | C | `ledger.ts`, `services/refunds.ts` |
| 11 | Plans/subscriptions | C | `services/subscriptions.ts`, `FeeVersion` |
| 12 | Hubtel SMS & notifications | C | `hubtel/sms.ts`, `services/notify.ts`, `jobs/handlers.ts` |
| 13 | Broadcasting | D | `services/broadcasts.ts`, `mini-services/realtime/`, `PlayerSim.tsx` |
| 14 | Promotions | E | `services/promotions.ts` |
| 15 | Web/mobile & purchase rules | E | web portal (native apps = remaining work); no store billing exists |
| 16 | Venue check-in & offline | C | `services/checkin.ts` (`clientScanId`, OFFLINE_SYNC CONFLICT) |
| 17 | Administration/moderation | E | `/api/v1/admin/[...sections]`, `ModerationReport`, `AuditLog` |
| 18 | Data model & API | A | `prisma/schema.prisma`, `GET /api/v1/openapi`, `docs/DATA_MODEL.md` |
| 19 | Security & costs | A/F | `docs/SECURITY_REVIEW.md`, `docs/COST_MODEL.md` |
| 20 | Acceptance cases | F | scripted verification — `docs/TEST_REPORT.md` |
| 21 | Dev data/config | F | `prisma/seed.ts`, `.env.example`, `env.ts` |
| 22–23 | Stages & handoff | F | this document + the docs suite |
| 24 | Official references | — | `docs/PROVIDER_CAPABILITIES.md` §6 |

## Reproduce the current state

```bash
# install + database + seeds (dev password Dev@12345 — development only)
bun install && bun run db:push && bun run db:seed

# quality gates
bun run lint && bunx tsc --noEmit

# bring up the topology
bun run dev                                   # app :3000
bun mini-services/worker/index.ts             # worker :3001
bun mini-services/realtime/index.ts           # realtime :3003
caddy run --config Caddyfile                  # gateway

# contract + health
curl -s localhost:3000/api/v1/openapi | jq '.info'
curl -s localhost:3000/api/v1/health | jq '.integrations'
```

## Deviation register (brief → implementation)

| Brief expectation | Deviation | Reason |
|---|---|---|
| Monorepo (NestJS API, RN apps, PostgreSQL, Redis) | Single Next.js app + worker + realtime on SQLite | Gateway exposes one Next.js origin; only file-based DB available; brief's own rule "Redis is never the only record" satisfied by DB-backed outbox — full rationale in `ARCHITECTURE.md` §6 |
| jest/vitest test suite | Scripted browser/API verification (`docs/TEST_REPORT.md`) | Environment tooling; acceptance cases still exercised end-to-end |
| Auto-renew subscriptions | Manual renewal (documented) | Requires officially supported provider flow; not invented |
| Native mobile apps | Web-first responsive portal | No native toolchain/device verification available; REST API remains the app boundary |
