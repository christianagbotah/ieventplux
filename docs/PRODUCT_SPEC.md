# iEventPlux — Product Specification

| | |
|---|---|
| **Product** | iEventPlux — events discovery, ticketing, social and broadcasting platform |
| **Client / Owner** | Christian Agbotah, Lightworld Technologies Ltd., Ghana |
| **Document status** | Matches the implemented system in this repository (single deployment, not the original monorepo target — see `docs/ARCHITECTURE.md` §Adaptations) |
| **Related docs** | `ARCHITECTURE.md`, `DATA_MODEL.md`, `PERMISSIONS.md`, `PAYMENTS_AND_SETTLEMENTS.md`, `PROVIDER_CAPABILITIES.md`, `SECURITY_REVIEW.md` |

---

## 1. Product purpose

iEventPlux gives Ghanaian event organizers — churches, ministries, conference hosts, cultural and community producers — one platform to **publish events, sell and control tickets, grow an audience, message attendees, and broadcast live (free or paid) to local and international viewers**, with the money trail fully accounted for.

The platform is a single product with four experiences on one deployment:

1. **Attendee experience** — discover events, buy tickets / RSVP, follow organizers, watch live streams, keep tickets and transfer them.
2. **Organizer workspace** — organizations with teams and roles, event lifecycle management, ticket inventory, attendee lists, check-in, messaging, broadcasts, promotions, payouts and billing.
3. **Platform administration** — verification, moderation, finance (fees, refunds, payouts, ledger), integrations health and operations sweeps.
4. **Assistive features** — an AI concierge (text + voice) and a CSS Effects Studio (a client-requested creator utility).

### 1.1 Market

- **Primary market: Ghana.** Currency is **GHS only** (`src/server/money.ts` — `SUPPORTED_CURRENCIES = ['GHS']`). Payment collection is designed around **Hubtel Online Checkout** (mobile money / card), the dominant local rails.
- **International viewing is supported and expected** — paid virtual passes and live streams can be purchased from anywhere.
- **International viewing ≠ payout onboarding.** Money is collected in GHS via the Ghanaian provider; organizer **payouts** require a Hubtel Send Money merchant agreement and Ghanaian settlement details. An international organizer can sell and be paid out only after completing that onboarding; the platform does not offer cross-border payout rails it has not contracted. This is a deliberate product boundary, not a defect.
- **Market focus: Christian/ministry events first** (the client's own community), then conferences, culture, food, tech and community events. Seed data reflects this mix.

### 1.2 Personas

| Persona | Description | Primary jobs |
|---|---|---|
| **Attendee (Ama / Kojo)** | Ghana-based or diaspora consumer on a phone | Discover events, buy tickets or RSVP, receive SMS/in-app updates, enter venue with QR, watch live, save/reel/comment |
| **Organizer owner (Pastor Samuel)** | Founder/owner of a ministry or event company | Create organization, get verified, publish events, manage team roles, request payouts, subscribe to a plan |
| **Event manager (Grace)** | Runs operations for an org | Ticket types & inventory, door check-in, organizer updates, live broadcasts, campaigns |
| **Finance staff (Daniel)** | Org money role | Orders/attendee finance views, refund requests, payout participation |
| **Check-in staff (Abena)** | Door/venue staff with a phone | Scan QRs, manual lookup, offline scanning, duplicate handling |
| **Platform support (Efua)** | Lightworld staff | User support, org verification queue, suspensions |
| **Moderator (Yao)** | Trust & safety | Reports, content takedowns, blocks/mutes enforcement |
| **Finance admin (Akosua)** | Platform money role | Refund processing (elevated), payouts lifecycle, ledger, fee versioning |
| **Super admin (Kwabena)** | Lightworld principal | All sections, settings, integrations health, operations sweeps |

---

## 2. Feature inventory

### 2.1 Implemented (in this repository)

| Area | Capability | Where |
|---|---|---|
| Discovery | Home feed, categories, search, city filters, live-now rail | `src/portal/views/Discover.tsx`, `/api/v1/discovery/[view]` |
| Events | Full lifecycle DRAFT→SCHEDULED→PUBLISHED→POSTPONED/CANCELLED→LIVE→ENDED; series with occurrences; agenda; venues; organizer updates to ticket holders | `src/server/services/events.ts`, worker `EVENT_LIFECYCLE` |
| Visibility | PUBLIC / UNLISTED (excluded from discovery+search+feeds) / INVITE_ONLY (address hidden until approved RSVP) | `events.ts`, discovery routes |
| Invitations | Codes, guest limits, optional approval | `Invitation` model, `/api/v1/invitations/[code]` |
| Ticketing | Reservations (15 min, configurable), quota invariants, per-buyer limits, group discounts, discount codes, free RSVP path | `src/server/services/ordering.ts` |
| Payments | Hubtel v1 Online Checkout adapter; callbacks; reconciliation; dev simulator with 6 scenarios | `src/server/hubtel/payments.ts`, `services/payments.ts` |
| Fulfilment | Idempotent paid fulfilment, free RSVP fulfilment, late/duplicate payment exception routing | `src/server/services/fulfilment.ts` |
| Tickets | Opaque `TKT-…` codes + HMAC QR payloads (no personal data); one-time claim-token transfers | `src/server/qr.ts`, `/api/v1/tickets/transfer/[token]` |
| Check-in | Online scan, manual lookup, duplicate detection, offline queue with `clientScanId` idempotency, CONFLICT preservation, device sessions with minimized rosters | `src/server/services/checkin.ts` |
| Ledger | Balanced append-only journals, 9 account codes, idempotency keys, reversals | `src/server/ledger.ts` |
| Refunds | Full-order MoMo refunds where provider supports; MANUAL_TRACKED otherwise; ticket revocation + reversal journals on confirmed refunds | `src/server/services/refunds.ts` |
| Payouts | REQUESTED→APPROVED→SUBMITTED→PAID/FAILED; settlement holds; reversal on failure; same-reference retries | `refunds.ts` (payout section) |
| Subscriptions | BASIC/PRO/ORG plans; backend-enforced entitlements; invoice + payment attempt + activation journal; grace period; cancel; **no auto-renew** | `src/server/services/subscriptions.ts` |
| Social | Follows (orgs/users), save/interest/going with privacy, comments, reactions, reels feed, reports/block/mute | `/api/v1/social/[action]`, `src/portal/views/Reels.tsx` |
| Broadcasting | LiveBroadcast access policies FREE/PAID/TICKET_HOLDERS/INVITED; entitlements (physical-only tickets never unlock virtual); 10-min playback tokens + heartbeat; stream key rotation; studio with camera preview & input health; OBS/vMix ingest keys shown once | `src/server/services/broadcasts.ts`, `src/portal/views/BroadcastView.tsx` |
| Promotions | Campaigns with atomic budget/spent (CPM billing), frequency caps, dedup telemetry, spend journals, "Sponsored" labels | `src/server/services/promotions.ts` |
| Messaging | Hubtel SMS adapter + dev simulator; SMTP or truthful SUPPRESSED email; consent registry; quiet hours 20–08; monthly org quotas; pre-send segment estimation (GSM-7 160 / UCS-2 70) | `src/server/hubtel/sms.ts`, `/api/v1/messages/[action]` |
| Admin | 12-section console (see §2.2) with elevation-gated privileged finance actions | `src/portal/views/AdminConsole.tsx`, `/api/v1/admin/[...sections]` |
| AI concierge | Text chat + voice turn (audio→ASR→LLM→TTS), real DB context, disable flag | `/api/v1/ai/[mode]`, `VoiceAssistant.tsx` |
| CSS Effects Studio | 38 self-contained scoped effects in 10 categories with live demos + copyable CSS/HTML | `src/data/css-effects.ts`, `src/portal/views/EffectsStudio.tsx` |
| Realtime | socket.io chat relay, presence counts, notification push | `mini-services/realtime/` |
| Background work | Durable SQLite-backed OutboxJob queue with 8 core job types | `mini-services/worker/` |

### 2.2 Admin console sections (12)

`overview` · `orgs` (+ verification) · `events` (+ suspend) · `moderation` (actions) · `payments` (+ provider events) · `refunds` (privileged process, elevation required) · `payouts` (lifecycle) · `fees` + `plans` (versioning) · `integrations` (health with truthful stages) · `sms` (log) · `audit` (log) · `operations` (sweeps run-now). Additional operational sub-sections (users, outbox queue by status, settings, categories, ledger browser) exist in the same console.

### 2.3 Planned / not implemented (honest list)

| Feature | Status | Blocker / note |
|---|---|---|
| Native Android/iOS apps | Scaffolded paths only | Requires React Native/Expo native dev builds; phone-camera RTMP publishing documented but **not verified on device** |
| Subscription auto-renew | Not implemented | Requires an officially supported provider flow; documented as manual renewal |
| Partial (line-item) refunds | Not implemented | Provider capability covers full-order MoMo refunds; partial refunds route to MANUAL_TRACKED |
| Cloudflare Stream live delivery | Adapter blocked | No credentials; synthetic canvas renderer used and clearly labelled |
| Hubtel Send Money submission | Adapter blocked | No credentials / merchant agreement |
| External ad-network connectors | Not implemented | Promotions run on-platform only |
| PostgreSQL in production | Designed for, not deployed | SQLite in this deployment; schema is portable (see `ARCHITECTURE.md`) |
| Automated test suite (jest/vitest) | Not present | Brief-required acceptance cases exercised via scripted browser/API verification — see `docs/TEST_REPORT.md` (written separately by the lead) |

---

## 3. Product rules

### 3.1 Money rules

1. **Integer pesewas end-to-end.** All amounts are `amountMinor` integers (GHS pesewas). No floating-point money anywhere (`src/server/money.ts`). Rounding: basis-point fees round half-up (`bpOf`).
2. **Display.** ₵ symbol, two decimals, thousands separators: `₵1,234.56`. Negative amounts use `−`. Provider payloads use plain decimal strings (`"400.00"`) converted once at the adapter boundary.
3. **Server-side pricing.** Prices come only from `TicketType.priceMinor` read inside the order transaction; buyers never submit amounts. Fee snapshot is stored per order (`Order.feeVersionId`, `Order.feeSnapshot`) so later fee changes never rewrite history.
4. **Commission model.** 5% ticket commission (500 bp), organizer-borne; 1.95% processing (195 bp) recorded as informational platform-borne cost. See `PAYMENTS_AND_SETTLEMENTS.md` for worked examples.
5. **A browser return never marks an order paid.** Only provider callbacks (idempotent) or authenticated server-to-server reconciliation change payment state.
6. **No payment ever "vanishes".** Unknown/unresolved money surfaces as `UNKNOWN` attempts, `EXCEPTION_REVIEW` orders, and `RefundCase` records routed for resolution.
7. **Currency:** GHS only. No FX, no multi-currency checkout.

### 3.2 Visibility & privacy rules

1. **PUBLIC** events appear in discovery, search, feeds and the concierge context.
2. **UNLISTED** events are excluded from discovery, search and feeds; reachable only by direct link.
3. **INVITE_ONLY** events hide the venue address until an approved RSVP; invitations carry codes, guest limits and optional approval.
4. **Interest privacy.** Saved/interested/going lists are private to the user; organizers see aggregate interest, not other users' save lists.
5. **QR payloads carry no personal data** — opaque ticket id + HMAC only.
6. **Broadcast entitlements:** physical-only tickets never unlock virtual benefits; access is FREE / PAID / TICKET_HOLDERS / INVITED with entitlement kinds PURCHASED / TICKET_BENEFIT / INVITED / ORG_STAFF.
7. **Attendee lists are org-only** (OWNER/ADMIN/EVENT_MANAGER/CHECKIN_STAFF). Ingest keys are organizer-only and shown once.

### 3.3 Verification gates

1. **Publishing paid-ticket events requires an ACTIVE (verified) organization.** Free RSVP events can be published by unverified orgs; paid ticket types gate on `OrganizerVerification.status = APPROVED`.
2. **Organizer verification** is a platform-admin flow (evidence + reviewer decision) surfaced in the admin console; one seeded org is deliberately left PENDING to demonstrate the flow.
3. **Privileged finance actions** (platform refund processing, payout approval) require **elevation** — a recent password re-check valid 10 minutes.
4. **Subscription expiry** restricts *new* organizer activity (publishing above plan caps) but **never invalidates attendee tickets** already issued.

### 3.4 Consent & messaging rules

1. **Consent registry** separates MARKETING from TRANSACTIONAL consent per channel/target (`Consent` model). Marketing sends to non-consenting targets are SUPPRESSED, not sent.
2. **Quiet hours 20:00–08:00** (organizer local time) block marketing sends.
3. **Monthly org SMS quotas** and a 6-segment-per-message cap are enforced pre-send.
4. **API acceptance ≠ delivery.** SMS states: SENT→ACCEPTED (provider ack)→DELIVERED (delivery receipt) — never conflated. The dev simulator's delivery is labelled synthetic.
5. **Email without SMTP is SUPPRESSED** truthfully; it never reports fake success.
6. **Dev verification codes** are exposed with a DEV label only when SMTP is absent — never in production.

### 3.5 Ticketing rules

1. **Never oversell.** `sold + reserved ≤ quota` enforced transactionally; quota 0 = unlimited.
2. **Reservations** hold capacity for 15 minutes (configurable `reservationMinutes`); expiry releases capacity atomically.
3. **Late success** against expired reservations: re-reserve if capacity allows; otherwise explicit exception + auto-opened refund — never oversell, never "payment vanished".
4. **Duplicate successful payments** auto-open a `RefundCase` and flag the order `EXCEPTION_REVIEW`.
5. **Free RSVP** issues tickets without payment but with the same inventory control.
6. **Transfers** use one-time claim tokens (`#/claim/{token}`); check-in is idempotent per `clientScanId` and preserves OFFLINE_SYNC conflicts (CONFLICT result, never discarded).

---

## 4. Exclusions & assumptions

### 4.1 Explicit exclusions (product decisions, not gaps)

- **No auto-renewal of subscriptions.** Requires an officially supported provider flow; renewal is manual. Grace period and cancel exist.
- **No partial refunds.** Supported path is full-order MoMo refunds per provider capability; unsupported cases become clearly-labelled `MANUAL_TRACKED`.
- **No piracy-proof streaming claims.** Protected playback (short-lived tokens, entitlements, revocation) raises the bar; no DRM is claimed.
- **No native app store binaries.** Digital-purchase rules (Apple/Google) are acknowledged in the brief's references; no store submission exists.
- **No profit forecasts** in the cost model (`docs/COST_MODEL.md` covers provider costs only).
- **No invented provider capabilities.** Where credentials/contracts are missing, features report blocked/simulated status honestly (see `PROVIDER_CAPABILITIES.md`).

### 4.2 Assumptions

| # | Assumption |
|---|---|
| A1 | Deployment is a single Next.js app + worker + realtime behind Caddy (see `ARCHITECTURE.md`); the brief's monorepo layout was adapted, not abandoned conceptually. |
| A2 | SQLite is the dev/deployment database; the schema (56 models, integer money, IANA timezones) is designed to be portable to PostgreSQL. |
| A3 | Hubtel is the sole payments/SMS provider for the Ghana market; separate credentials per API (checkout, Send Money, SMS) as the provider requires. |
| A4 | Timezones are IANA identifiers per user; event times are stored UTC and rendered per-viewer timezone. |
| A5 | Dev seeds (14 users, 4 orgs, 19 events, 5 orders, refunds + payout demo cases, campaign with telemetry; password `Dev@12345`) are development-only and clearly synthetic. |
| A6 | AI concierge is nonessential to core flows and can be disabled (`AI_CONCIERGE_ENABLED=false`). |
| A7 | Reels use synthetic dev clips (poster-based Ken Burns animations), honestly labelled, until a video provider is configured. |
| A8 | Phone-camera RTMP publishing is documented as requiring native dev builds — not verified in this environment. |

---

## 5. Non-goals

- Multi-currency settlement or FX.
- Cross-border payout rails beyond the contracted Ghanaian provider.
- Seat-level mapping / reserved seating (ticket types + seat info text only).
- Third-party ad networks (promotions are first-party placements).
- Offline-first attendee apps (offline support exists for **check-in devices** only).
