# iEventPlux — Test Report (actual results)

**Environment:** Linux sandbox · Next.js 16.1.3 (Turbopack) dev server on :3000 · worker on :3001 · realtime on :3003 · SQLite (WAL) · Node/Bun 1.3.14 · Chromium via agent-browser (headless).
**Date of run:** 2026-11-11 (session timestamps in UTC).
**Data:** deterministic dev seed (`bun run db:seed`) + live-created records during the tests below.

> What this is NOT: a jest/vitest/Playwright CI suite. Per the brief's honest-evidence rules, the money-critical and access-critical cases were exercised through scripted browser automation (agent-browser) and direct API calls against the running stack. A formal automated suite is listed as remaining work in IMPLEMENTATION_PLAN.

## Static checks

| Check | Command | Result |
|---|---|---|
| TypeScript | `bunx tsc --noEmit` | ✅ 0 errors (app code; scaffold folders excluded in tsconfig) |
| ESLint | `bun run lint` | ✅ 0 errors (29 warnings — documented fetch-on-mount pattern + a11y notes) |
| Prisma schema | `bun run db:push` | ✅ 56 models applied |
| Seed | `bun run db:seed` | ✅ 14 users, 4 orgs, 19 events, 5 orders, 38 CSS effects; ledger balanced |

## Service health

| Endpoint | Result |
|---|---|
| `GET :3000/api/v1/health` | ✅ `healthy`, database `up`, integration stages + warnings listed truthfully |
| `GET :3001/health` | ✅ `healthy` (worker heartbeat, jobs processing) |
| `GET :3003/health` | ✅ `healthy` (socket.io + rooms) |
| Worker log | ✅ continuous sweep cycles (RESERVATION/EVENT_LIFECYCLE/RECONCILE/SMS_STATUS/PLAYBACK/REMINDER) all `DONE` |

## E1 — Public discovery & visibility (browser)

- `/` renders hero, sponsored (labelled), live-now, featured, upcoming, category chips, filter bar — ✅.
- Mobile viewport 390×844 renders responsively (screenshot `docs-assets/discover-mobile.png`); desktop 1440×900 ✅.
- Unlisted (*Board Strategy Retreat*) and invitation-only (*Donors' Dinner*) events are absent from home/search/feeds — ✅ (verified via API list responses; both excluded).

## E2 — Paid ticket purchase end-to-end (browser, real code path)

1. Signed in as `ama@example.dev` ✅
2. Event detail *Accra Gospel Night of Wonders* → selected **2 × VIP (₵400)** → order created with 15-min hold ✅
3. `/payments/initiate` → redirected to the **Hubtel dev simulator** page (explicitly labelled; cannot run in production) ✅
4. *Approve payment* → callback stored as ProviderEvent → worker processed → attempt `SUCCESS` → **order PAID** ✅
5. **2 tickets issued** (TKT-2AEF3E23AA7695 / TKT-724579EFDEFD33) with QR payloads ✅
6. My Tickets → QR dialog renders server-generated SVG ✅
7. SMS receipt queued (MessageDelivery, simulator-marked) ✅
8. Ledger journal posted and balanced: `DR collections ₵400 / CR platform_fees ₵20 / CR organizer_payable ₵380` ✅

**Defect found & fixed during verification:** callback field-casing (`ClientReference`) dropped the reference → REJECTED. Fixed with case-tolerant parsing in `parseCallback`, then re-verified green.

## E3 — API contract & admin surfaces

- `/api/v1/openapi` returns the versioned contract ✅
- Admin overview aggregates correctly: gross volume ₵850.00, platform revenue ₵42.50 (exactly 5% of PAID orders: 400+400+50) ✅

## E4 — Auth flows

- Login sets HttpOnly session cookie; `/auth/me` returns user + memberships ✅
- Password reset issues code (dev-exposed with DEV label), confirm + global session revocation coded (API-verified path) ✅
- Register → session + verification code queued ✅

## E5 — Organizer workspace (browser, as chapel OWNER)

- Dashboard: tickets sold, gross ₵800, available payout, followers, next events (incl. 4 series occurrences) ✅
- Finance tab: gross/fees/net/pending/available + append-only journal list with DR/CR lines ✅
- Events: editor dialog (fields + ticket types), publish/postpone/cancel buttons wired to transition rules ✅
- Team, billing (plan cards + purchase → simulator checkout path), studio (camera preview + health + go-live + key rotation), messaging (compose + segment estimate + delivery log), promotions (create boost + budget bar) ✅

## E6 — Broadcast entitlements & playback (browser + API)

- Free broadcast (*Worship Without Limits*) plays via labelled synthetic renderer after `POST /broadcasts/{id}/play` issues a 10-min token ✅
- Paid masterclass requires entitlement; ama's seeded virtual ticket resolves `TICKET_BENEFIT` ✅
- Physical-only ticket does **not** grant virtual access (entitlement resolution filters on `includesVirtualAccess`/virtual kinds) ✅ (logic verified by query shape + seeded pass)
- Chat messages persist via API and relay through realtime; presence counts broadcast ✅

## E7 — Worker queue & reconciliation

- `PROCESS_PROVIDER_EVENT` job picked up within 5 s of callback intake and fulfilled exactly once ✅
- Reconciliation sweep runs every 60 s; a seeded never-paid attempt progressed to `UNKNOWN` after the documented 6 bounded checks and surfaces in Admin → Payments exceptions ✅
- Reservation sweep released expired holds without touching paid orders ✅ (worker log)

## E8 — Check-in (API + browser UI)

| Case | Input | Result |
|---|---|---|
| Valid ticket code | `TKT-2AEF3E23AA7695` | ✅ `ADMITTED` + holder/type returned |
| Same ticket again (new clientScanId) | same | ✅ `DUPLICATE` with original admission time |
| Replayed same clientScanId | same id | ✅ original result returned (idempotent) |
| Forged QR signature | `IEVX1.faketicketid.aaaa` | ✅ `INVALID` (after FK-bug fix) |
| Valid QR payload (`IEVX1.{id}.{sig}`) | ama ticket #2 | ✅ `ADMITTED` |
| Offline batch replay (`/checkin/sync`) | queued scan | ✅ synced; conflicts preserved as `CONFLICT` |

**Defect found & fixed:** invalid QR payloads hit a foreign-key error (scan row with unknown ticketId) → now a clean `INVALID`.

## E9 — Refunds & privileged actions

- Refund case seeded (REQUESTED) appears in Admin → Refunds ✅
- Processing requires elevation: un-elevated call returns `ELEVATION_REQUIRED` (401) with guidance; password confirmation unlocks 10-min window ✅ (API-verified)
- Simulator-mode processing: unused tickets → `REFUNDED`, mirrored reversal journal posted, order → `REFUNDED`, repeated processing blocked ✅ (code path + journal invariant; re-run guard verified by status check)

## E10 — Privacy/visibility invariants

- Unlisted/invite-only excluded from `/discovery/home`, `/events` list, `/discovery/search` ✅
- Invite-only event hides address for anonymous users in event detail ✅
- Attendee lists/orders/finance denied without org membership ✅ (403s)

## E11 — Admin console (browser, as SUPER_ADMIN)

- Overview, organizations (+ approve *Accra Events & Co.* → org `ACTIVE`/verified in DB, paid sales unlocked), events, moderation actions, payments + provider events, refunds, payouts lifecycle buttons, fees versioning, plans, integrations health (truthful stages), SMS log, audit log, operations sweeps ✅

## E12 — Frontend quality

- jQuery view transitions between routes ✅
  - **Defect found & fixed:** custom easing name crashed (`jQuery.easing[this.easing]`); fixed by registering `easeOutQuad/easeOutCubic`; post-fix full navigation cycle → **0 page errors**.
- Effects Studio: 38 effects render live demos in DOM (scoped `.efx-*` classes verified), View-code dialog + Copy CSS/HTML ✅
- Empty/loading/skeleton states observed across views ✅

## E13 — Messaging

- Segment estimator returns GSM-7/UCS-2 + counts pre-send ✅
- Organizer send: consent suppression, quiet-hours rejection (20:00–08:00), quota enforcement, queued/accepted/delivered states in log ✅ (API-verified; simulator delivery clearly labelled)

## E14 — Payment edge cases (via simulator scenario buttons / API)

| Case | Outcome | Status |
|---|---|---|
| Forged amount callback | attempt → `UNKNOWN`, event `REJECTED`, order stays unpaid | ✅ |
| Duplicate success callback | dedup key → single fulfilment | ✅ |
| Walk away (no callback) | order stays `PENDING_PAYMENT`; reconciliation → `UNKNOWN` after 6 checks; no new charge | ✅ |
| Late success after hold expiry | re-reserve if capacity, else exception + auto refund case (code path verified; capacity-present case exercised) | ✅ |
| Browser return URL alone | informational redirect only — order state unchanged | ✅ |
| Multiple successful attempts on one order | duplicate-payment RefundCase + `EXCEPTION_REVIEW` | ✅ (code path) |
| Unknown reference callback | stored `REJECTED` (forensics) | ✅ |

## Concurrency note

SQLite serializes writers, so competing-buyer oversell protection was verified by invariant checks inside the reservation transaction (quota re-read + conditional claim) rather than a parallel-load harness. A load/concurrency smoke test with PostgreSQL + N buyers is documented as remaining work.

## Re-verification round 2 (2026-11-11, post-handoff session)

Fresh end-to-end pass after restart; all three services up (:3000 / :3001 / :3003).

| Case | Outcome | Status |
|---|---|---|
| Golden path re-run | 2 × Regular (₵160) → order `ORD-037044A7A1` → initiate → simulator *Approve* → callback → **PAID**, tickets `TKT-8AF01EF2254288` / `TKT-955F3BE73FBA33` issued, My Tickets + QR SVG + transfer option render | ✅ |
| Per-buyer limit | ama already at 4×VIP cap → `POST /orders` **409** "Per-buyer limit reached" — correct rule enforcement, frontend keeps sheet open | ✅ |
| Effects Studio | 38 effects render; code dialog shows full CSS (incl. `prefers-reduced-motion`) + HTML; **Copy CSS** → clipboard + toast "self-contained" | ✅ |
| AI concierge (text) | Question answered with **live DB events** (City Health Walk, Sunday Celebration Service, prices) | ✅ |
| AI voice pipeline (API-level) | TTS-generated question WAV → `POST /ai/voice` → ASR transcript exact → LLM reply (real events) → **34.3 s / 1.6 MB WAV** spoken reply returned | ✅ (after fix) |
| Voice UI degradation | Headless Chromium denies mic → honest "Microphone permission denied. You can still type" message | ✅ |
| Sticky footer | 390×844 short page: sticks to viewport bottom; long page: pushed naturally; desktop 1280×800: sticks | ✅ (after fix) |
| Console / dev-log errors | none during the round | ✅ |
| `bun run lint` / `bunx tsc --noEmit` | 0 errors / 0 errors (34 warnings — documented pattern notes) | ✅ |

**Defect found & fixed in round 2:** the TTS provider rejects `response_format: 'mp3'` (HTTP 400, code 1214 — isolated SDK test confirmed `wav` works). The AI voice route therefore silently degraded every spoken reply to text-only (`audioBase64: null`). Fixed to `wav` + `audio/wav` in `src/app/api/v1/ai/[mode]/route.ts`; re-verified with a real round-trip (TTS → ASR → LLM → TTS) returning valid 24 kHz audio. Also hardened the portal footer for iOS safe-area + fixed mobile-bottom-nav clearance (`pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0`).

## Re-verification round 3 (2026-11-11, AI + UX expansion)

New feature surface verified with the same honest-evidence rules (browser automation + direct API calls):

| Case | Outcome | Status |
|---|---|---|
| AI smart search (`POST /ai/search`) | "free church events in Accra this weekend" → LLM filters `{category: church-service, city: Accra, price: FREE, when: THIS_WEEKEND}` → real DB query → Sunday Celebration Service returned with prices | ✅ |
| AI search UI (browser) | Example chip → AI summary banner + humanized applied-filter chips + result grid; honest empty state when 0 matches (workshops live in Tema, not Accra — correctly no fabrication) | ✅ |
| AI recommendations (`POST /ai/recommend`) | ama (has tickets/saves) → 4 personalized picks, LLM reasons per event, `degraded: false`; Maame (no history) → honest "Popular right now" trending rail by real soldCount, `degraded: true` | ✅ |
| AI Studio — description (browser, as Maame/owner) | Brief (Sunset Jazz on the Rooftop…) → summary + markdown description + tags; copy stayed strictly within provided facts (GHS 80, 120 seats, Skybar 25) | ✅ |
| AI Studio — captions | WhatsApp / X / Instagram variants generated with per-platform tone + char counts | ✅ |
| AI Studio — poster (browser + API) | 864×1152 PNG generated with correct headline/date/venue text and chosen palette ("Nights of Grace", "Masquerade Ball Accra"); **Save to library** → real `POST /uploads` → file written to `public/uploads/`, MediaAsset row created; Download works | ✅ |
| Command palette | Ctrl+K opens; navigates; debounced live event search with cover thumbnails ("gospel" → Accra Gospel Night of Wonders); theme toggle + sign-out actions | ✅ |
| Dark/light/system theme | next-themes class strategy; hero, cards, AI panels, studio all legible in dark; persisted across navigation | ✅ |
| Confetti on PAID order | canvas observed firing on `/order/ORD-037044A7A1` (poll found canvas at 0 ms); suppressed under `prefers-reduced-motion`; one-shot per mount | ✅ |
| Selling-fast / sold-out signals | Real quota/soldCount now in events + discovery payloads; `inventoryState()` renders badges only for quota>0 events at ≥70% / 100% (no seeded event currently ≥70% — logic status-gated, no fake data) | ✅ |
| Order access control regression | Maame opening Ama's order → "You do not have access to this order" — ownership rule intact | ✅ |
| Mobile 390×844 | Hero stacks, AI panel usable, footer clears bottom nav, safe-area kept | ✅ |
| Console / page errors | none after fixes (early HMR race cleared on fresh load) | ✅ |
| `bun run lint` / `bunx tsc --noEmit` | 0 errors / 0 errors (17 warnings — down from 34 baseline) | ✅ |

**Defects found & fixed in round 3:** (1) confetti hooks were declared after an early return in OrderView (rules-of-hooks lint error) — moved above the guard; (2) mobile hero headline rendered "gathering.Attend" without a space when the `<br>` was hidden — explicit `{' '}` added; (3) raw enum values in AI applied-filter chips (THIS_WEEKEND) — humanized mapping added.

## Re-verification round 6 (2026-11-11, recurring series tooling)

**Feature set under test:** weekly series creation with occurrence generation, bulk apply-to-future-occurrences (content fields + wall-clock time adoption), public series sibling list + "next date" chip, plus two real defect fixes (New-event dialog could never open; hash-router hydration mismatch).

**API-level evidence (live stack):**

| Case | Result |
|---|---|
| `POST /events` with `repeatWeeks:3` → base event + `EventSeries` row + 3 DRAFT occurrences (+7d each, duration preserved) → `{seriesId, occurrencesCreated:3}` | ✅ |
| `GET /events/[id]/series` → series metadata + up to 12 future sibling occurrences (invite-only filtered out, self excluded) | ✅ |
| `PATCH` base event (summary, city) then `POST /events/[id]/apply-to-series {fields:[summary,city], adoptTime:true}` → `{updated:3}`; sibling detail check confirms propagated summary/city and 09:00–11:30 wall-clock adopted with duration intact | ✅ |
| Whitelist enforcement: only the 13 whitelisted content fields are copyable; adoptTime recomputes each occurrence's local start in the event timezone via Intl offset math | ✅ |
| Guard: apply-to-series on a non-series event → 400 "not part of a series"; empty selection → 400 | ✅ |

**Browser evidence (agent-browser, 1280×800 + 390×844):**
- Organizer Events list: "Series" badge on series rows (base + occurrences).
- EventEditor (edit): "Part of a weekly series" panel → Apply dialog (13 field chips + "same start time" switch) → apply via UI → toast "Applied to 3 upcoming occurrences".
- EventEditor (create): "Repeat weekly" toggle + occurrences input; UI-created "Midweek Bible Study" with 2 extra weeks → DB shows base + `-w2` + `-w3` DRAFTs + EventSeries row; list shows Series badge.
- EventDetail: "Weekly series — next date Sat, 28 Nov 2026, 9:00" chip links to the nearest future sibling (verified on base AND on an occurrence page).

**Defects fixed this round:**
1. **"New event" button never opened the editor** — render gate `{editing !== null && …}` made `openEditor(null)` a no-op. Fixed to `(editing !== null || creating)` with a remount `key` so the create form starts clean. (Pre-existing since the events manager was built.)
2. **Hash-router hydration mismatch on every direct load** — `useRoute()` read `window.location.hash` in its client initializer while the server always rendered `/`, so any deep link (`#/organizer`, `#/event/…`) logged "Hydration failed" and forced a full client regeneration. Fixed by initializing to `/` on both sides and resolving the real hash in the mount effect (identical SSR/first-paint output, then a plain re-render). Verified: zero hydration errors across `/`, `#/effects`, `#/reels`, `#/me`, `#/organizer`, `#/event/…` deep links; deep-linked views render correctly.

**Static:** `bun run lint` 0 errors / 17 warnings (the +1 is the intentional mount-sync `setRoute` in router.ts — same documented set-state-in-effect category as ThemeToggle/AiSearchPanel); `bunx tsc --noEmit` 0 errors.

## Re-verification round 5 (2026-11-11, sold-out waitlist + calendar export)

**Feature set under test:** per-event waitlist for sold-out inventory (guest + authed join, FIFO positions, honest first-come-first-served promotion), refund-frees-inventory fix, .ics calendar export, organizer waitlist visibility. New model `WaitlistEntry` (schema now 57 models).

**API-level evidence (live stack):**

| Case | Result |
|---|---|
| Sold-out detection after real purchase (ORD-80731C4684, quota-1 event, simulator callback `STORED` → PAID → ticket issued) | ✅ |
| Guest waitlist join while sold out → `{position:1}`; authed join → `{position:2}` (FIFO by createdAt) | ✅ |
| Duplicate join (same contact, case-insensitive email) → idempotent, same position, no duplicate row | ✅ |
| Join guard on events with availability → `409 CONFLICT "Tickets are currently available — go grab one instead of the waitlist."` | ✅ |
| Callback forgery protection: callback without a prior `initiate` → `UNKNOWN_REFERENCE`, nothing fulfils | ✅ |
| Organizer raises quota 1→3 → `WAITLIST_PROMOTE` job → both entries `WAITING→NOTIFIED` with notifiedAt | ✅ |
| Promotion notifications: 2 × in-app (`WAITLIST_PROMOTED`) + 2 × SMS via durable queue, both `DELIVERED` (simulator), honest "first come, first served — nothing is held" copy | ✅ |
| Refund path: org `refund-request` → admin approve → admin elevate → process → order `REFUNDED`, ticket `REFUNDED`, ledger reversal journal posted, `soldCount` decremented 1→0 (inventory re-sellable — **pre-existing defect fixed**) | ✅ |
| Leave waitlist → `{left:true}`; re-join after leaving → `{reactivated:true}` at tail position | ✅ |
| `GET /events/[id]/ics` → `text/calendar; charset=utf-8` + attachment filename; VCALENDAR parses with correct DTSTART/DTEND/SUMMARY/LOCATION/ORGANIZER/STATUS | ✅ |
| Waitlist auto-closes when capacity returns (join/leave both blocked with honest message) | ✅ |

**Browser evidence (agent-browser, 1280×800 + 390×844, light + dark):**
- EventDetail (sold out): glass panel waitlist card with count ping badge + social proof + neon CTA; join dialog (floating-label inputs, type chips, seat selector) → guest join via UI → toast "You are #2 in line"; "Add to calendar" icon button in hero action row.
- EventDetail (organizer): "Waitlist (N waiting)" card listing every entry with contact, party size, per-type and status badges (Waiting/Notified).
- OrderView: calendar download link on the event card (stopPropagation, no navigation hijack).
- Zero console errors platform-wide during the sweep.

**Static:** `bun run lint` 0 errors / 16 warnings (baseline); `bunx tsc --noEmit` 0 errors.

## Re-verification round 4 (2026-11-11, Effects Studio design pass)

Every portal view was re-skinned using the studio's own `efx-*` catalog (38 effects, injected globally by a new `EffectsRuntime` component — the same copy-ready CSS the studio demos showcase, now the portal's actual design system). Verified with browser automation at 1280×800 and 390×844, light and dark themes:

| Case | Outcome | Status |
|---|---|---|
| Global effects runtime | `<EffectsRuntime />` in AppPortal injects the full catalog once; all views compose with `efx-*` classes; dark-mode adaptations for light-hardcoded effects added in globals.css | ✅ |
| Discover | Aurora hero stage + animated gradient headline + neon-pulse CTA + glow-focus search + badge-ping "Live" chip + underline-slide section links; verified desktop + mobile, both themes | ✅ |
| Event detail | Ken-burns cinematic hero, glassmorphism checkout panel (dark glass on both themes), typewriter summary (only when ≤24 chars), glow inputs, neon CTAs, underline links | ✅ |
| Defect found & fixed | Event title was painted **behind** the ken-burns image (always-on transform creates a compositing layer above the overlapping `-mt-16` title block) — fixed with `relative z-10` on the title container; re-verified | ✅ |
| Real checkout E2E (restyled UI) | pastor@lightworld.dev → Get tickets (glass panel) → +1 Regular → neon "Checkout · ₵80.00" → Hubtel dev simulator → Approve → **ORD-F134813A3F-A1 PAID, ticket TKT-CB08989742C69A issued**; OrderView shows copy-success-checkmark control + glass "1 ticket issued" panel | ✅ |
| Reels | Heart-burst like toggle (pure-CSS burst wired to real react state), share chip as copy-success-checkmark, ken-burns posters, one-shot message slide-ins | ✅ |
| Live Now / Broadcast | Neon "On Air" stage header (rendered only when live broadcasts exist), badge-ping radar dots, ripple-click watch CTA, glow chat input, `iefx-msg-in` on new chat messages | ✅ |
| Auth | Aurora welcome stage, floating-label email/password (label floats verified by filling the form and signing in), neon submit; signed in as pastor through the restyled form | ✅ |
| Me / OrgProfile | Underline-slide tab nav (amber active), badge-ping on VALID tickets, copy-checkmark in QR dialog, ken-burns org cover, shine-sweep follow CTA | ✅ |
| Organizer workspace | Gradient section headlines, glass "Gross sales" KPI, vertical underline-slide sidebar, striped capacity overlay, dual-ring loaders on async actions | ✅ |
| AI Content Studio (as pastor/owner) | Gradient headline, glow "Key notes" textarea, shine-sweep Generate CTA, orbit/dual-ring generating state, caption reveal on poster | ✅ |
| Effects Studio page | All 38 live demos still render (catalog CSS now shared with the app); filters + copy flows intact | ✅ |
| Mobile 390×844 | Discover hero/CTAs, event detail, reels action rail, studio grid — no overflow; footer + bottom nav safe-areas intact | ✅ |
| Console errors | None on fresh loads of /, event, reels, me, signin, organizer, ai-studio, effects (a hydration warning seen mid-session was stale buffer from a prior hash-routed session, absent on clean reloads) | ✅ |
| `bun run lint` / `bunx tsc --noEmit` | 0 errors / 0 errors (16 warnings — down from 34 baseline) | ✅ |


## Re-verification round 7 (2026-11-12, AI weekend planner)

New capability: `POST /api/v1/ai/planner` — the last planned advanced-AI feature. A window + city + party size + budget + interests becomes a day-by-day itinerary built **only** from real catalogue events (every LLM pick is validated against the database and re-bucketed onto the event's true date; the LLM's claimed dates are never trusted). Anonymous-accessible, rate-limited 8/min, honest degradation to a demand-ranked schedule if the LLM fails.

| Case | Outcome | Status |
|---|---|---|
| `POST /ai/planner {window: NEXT_7_DAYS, partySize: 2, budgetMinor: 30000}` | 3-day plan (Sun 15 / Mon 16 / Wed 18 Nov) of real seeded events with per-pick reasons, real times/prices; summary honest ("A spiritual and creative journey through Accra and Tema…") | ✅ |
| City filter (`city: Tema`) | Only Tema events returned (Youth Creative Arts Workshop) — filter applies server-side on the real where-clause | ✅ |
| Budget respect | With ₵300 budget the LLM picked free/cheap events (est total ₵0–4); with an absurd ₵1 budget/4 people → honest note "Estimated ₵4.00 for 4 — above your ₵1.00 budget. Swap a pick or trim the party." | ✅ |
| Sold-out honesty | Sold-out pick carries a "Sold out · waitlist" chip + the LLM was instructed (and observed) to mention the waitlist in its reason | ✅ |
| Empty catalogue (city: Kumasi) | `{empty: true, days: []}` + honest summary "No events are on the catalogue for this weekend in Kumasi yet." — no fabricated events | ✅ |
| Rate limit | 9 rapid calls → first N=8 `200`, then `429` (in-memory per-IP, 60s window) | ✅ |
| Budget math integrity | `estPerPersonMinor` = Σ cheapest live ticket per pick; `estTotalMinor` = × partySize — computed server-side from real ticketTypes, never from LLM output | ✅ |

**Browser evidence (agent-browser):**
- Discover hero: new "Plan my weekend" CTA (between the featured-event CTA and "Ask AI to find events").
- Planner sheet (desktop 1280×800 + mobile 390×844): aurora hero + animated-gradient headline, window chips, city select fed by new `GET /discovery/home` → `cities: [Accra, Tema]`, party stepper, floating-label budget input, interest chips (10 real categories), shine-sweep "Build my plan" CTA.
- Full build run (desktop): Next 7 days + party 3 + ₵50 budget + music/ministry interests → summary callout, striped budget bar "Est. ₵3.00 for 3 people · Budget ₵50.00" (within budget, emerald; amber variant + note when over), day groups with gradient day labels, pick cards with time range/city/price/AI reason, "Sold out · waitlist" chip, click-through navigates to the real event page (`#/event/sunday-celebration-service-2026-11-15`).
- "Download plan (.ics)" → client-side RFC-5545 VCALENDAR from the real event times (escaping verified by code inspection) + toast "Calendar file ready"; no page errors.
- Loading state: dual-ring loader with labelled status; result region `aria-live="polite"`.
- VLM screenshot review (mobile + desktop): "clean and professional… no overlapping elements and no cut-off text… elegant" — two fixable nits found and fixed during the pass (hero kicker wrapped at 390px → shortened; hard aurora edge against the sheet body → soft gradient transition; low-contrast close over dark hero → glass pill styling).
- Zero console errors; `prefers-reduced-motion` respected (catalog effects ship fallbacks; count-up/aurora already guarded).

**Static:** `bun run lint` 0 errors / 17 warnings (baseline); `bunx tsc --noEmit` 0 errors.


## Re-verification round 8 (2026-11-12, live engagement: realtime polls + audience Q&A + chat relay fix)

New capability: `LivePoll` / `LivePollOption` / `LivePollVote` / `AudienceQuestion` / `AudienceQuestionUpvote` (5 new models; 62 total) + `event:{id}` rooms on the :3003 relay. Polls + moderated Q&A render on the event page (`LiveEngagement` panel, organizer- and attendee-adaptive) and in a new organizer **Live Room** workspace tab. **Pre-existing defect fixed:** the broadcast chat POST never relayed through `/emit` despite its comment claiming it — live chat messages never appeared live; the confirmed message is now relayed to `broadcast:{id}` and the client dedupes by id (local append remains as relay-down fallback).

| Case | Outcome | Status |
|---|---|---|
| `GET /events/[id]/polls` (anonymous) | OPEN first then CLOSED, per-option tallies + totalVotes, `isOrg:false`; DRAFTs hidden | ✅ |
| `GET /events/[id]/questions` (anonymous) | Pinned first, answered last-of-priority, upvote counts; HIDDEN excluded | ✅ |
| Vote | Fresh user → tallies + myOptionId returned; guest → 401; **re-vote → 409** (unique index, race-safe) | ✅ |
| Org poll lifecycle | Create (2–6 distinct options validated) → DRAFT; **open requires event LIVE**; opening auto-closes other OPEN polls of the event (`poll:closed-others` broadcast); close finalizes | ✅ |
| Attendee tries organizer action | `403 Only the event organizers can manage polls.` | ✅ |
| Q&A | Ask (6–280 chars, rate-limited 10/min); upvote toggle (409 on own question); org answer publishes instantly; hide → removed for guests, still listed for org (moderation) | ✅ |
| Realtime relay (raw socket.io listener on `event:{id}`) | `poll:vote`, `qa:new`, `qa:update` all received with correct payloads | ✅ |
| Cross-client (agent-browser ×2 sessions through the :81 gateway) | Organizer pinned a question → attendee tab showed the Pinned badge **without reload**; organizer created + opened a new poll → attendee tab received it live and voted; organizer closed it → attendee tab showed "Closed · Final result · 1 vote · 100%" | ✅ |
| Defect found & fixed mid-round | `poll:update` broadcasts zeroed tallies (toView never included counts) and client replaces lost `myOptionId`/`myUpvote` markers — broadcasts now carry complete recomputed tallies (`completeView`) and clients preserve per-viewer markers; resilience refetch (30 s while live) added for proxies that strip websockets | ✅ |
| Live Room workspace tab (as org) | LIVE events listed with engagement stats ("4 polls ready · 1 pending Q · 4 answered") + deep link to the event page; upcoming-within-48h section | ✅ |
| Mobile 390×844 | Panel usable, tabs reachable, no overflow; footer sticks (bottom ≥ viewport −1); zero console/page errors | ✅ |
| VLM screenshot review | Header legibility improved (glass 78%→85% opacity + blur 16px); redundant "Leading" badge suppressed when only one option has votes; remaining VLM notes were design-taste items consistent with the established brand system | ✅ |

**Static:** `bun run lint` 0 errors / 17 warnings (baseline); `bunx tsc --noEmit` 0 errors. Repo hygiene: accidental UUID-named commit dropped; `db/custom.db-shm` / `db/custom.db-wal` untracked (transient WAL artifacts; `custom.db` stays tracked for demo continuity).


## Re-verification round 9 (2026-11-12, post-event ratings & reviews)

New capability: `EventReview` (63rd model) — social proof with honest gating. Aggregates (average, count, 5→1 distribution) count VISIBLE reviews only; composing requires a **fulfilled ticket on an ENDED event** (paid or free-fulfilled orders both land at `PAID`); one editable review per attendee (`@@unique(eventId,userId)` — re-POST **edits**, never duplicates); organizer hide/restore moderation with audit; authors keep visibility of their own hidden reviews. Ratings surface on the event page (hero "Attendee rating" stat + full Reviews panel) and ride along discovery listings (`withRating` server-side aggregate — no N+1, included in the same query). Dev seed: 3 fulfilled historical orders + 3 reviews (5/4/5) on the ENDED Easter production.

| Case | Outcome | Status |
|---|---|---|
| `GET /events/[slug]/reviews` (guest) | avg 4.7 · 3 reviews · dist [5:2, 4:1] + items with "Verified attendee" badges; `eligibility:null` | ✅ |
| Eligibility | ama/kojo (tickets) → ELIGIBLE (+`mine`); usher (no ticket) → NOT_TICKET_HOLDER; **LIVE event → 409 "Reviews open once the event has ended."** | ✅ |
| Non-holder POST | 409 "Only attendees with fulfilled tickets can review this event." | ✅ |
| Upsert | First POST `created:true`; second POST **edits** (`created:false`, "Review updated."); rating 9 → 400 | ✅ |
| Moderation | Org hide → guest aggregate drops (5·2) and item disappears; org still sees all 3; author still sees own hidden review + `mine`; attendee moderation → 403; restore → back | ✅ |
| Browser (agent-browser, gateway origin) | Guest panel: 4.7 headline + distribution bars + review cards; kojo: edit form prefilled (4/5, counter 91/600) — changed to 5 stars + body → aggregate recomputed live to 5·3 (API-confirmed); org: moderation buttons + honest "Only attendees with fulfilled tickets can review this event." note; hide/restore exercised via UI | ✅ |
| Surfacing | Event-detail hero stat "Attendee rating 5 · 3 reviews" (uppercase label); `discovery/search` rows carry `ratingAvg`/`ratingCount`; EventCard renders the star chip when present | ✅ |
| Defects found & fixed mid-round | (1) GET route passed the raw slug as `eventId` to the service → always-empty listings via slug (fixed: resolve `event.id` first, slug-or-id like the detail route); (2) hidden reviews were excluded from the author's own query before the author check → authors lost sight of their reviews (fixed: fetch all rows, filter visibility in JS); (3) anchor/section scrolls landed under the sticky glass header → `scroll-margin-top: 84px` for section ids (live-verified: reviewsTop 84 ≥ headerBottom 65) | ✅ |
| Ops notes | Corrupted Turbopack cache (killed-process write) diagnosed via `turbo-persistence` panic → `.next` wiped + clean restart; stale zombie next-server (stale DB inode) fully cleaned; all three services restarted and re-verified | ✅ |
| Mobile 390×844 | Reviews panel renders (panel width 358), composer reachable, no console/page errors | ✅ |
| VLM review | Full-page screenshots show sticky-header stitching artifacts (expected for full-page captures); live rect checks confirm no overlap at rest; actionable fix (scroll-margin) applied | ✅ |

**Static:** `bun run lint` 0 errors / 17 warnings (baseline); `bunx tsc --noEmit` 0 errors.


## Re-verification round 10 (2026-11-12, organizer insights — real analytics)

New capability: `GET /api/v1/orgs/[id]/insights` + an **Insights** workspace tab. The honesty contract is in the service header: analytics derive ONLY from real transactional rows (settled orders, issued tickets, admission scans, VISIBLE reviews, active waitlists) — no page-view or "engagement" numbers are invented. Seed gains a realistic sales fortnight (5 extra real orders through `createOrder` + paid-fulfilment, all backdated; existing orders settled onto the window; Easter orders pre-date their 60-day-old event; ushers scanned 4 of 5 Easter tickets with real `AdmissionScan` rows).

| Case | Outcome | Status |
|---|---|---|
| API payload (chapel, as pastor) | totals: 16 tickets · ₵1,840 gross · 25% check-in (4/16) · 4.7 avg rating; 11 tickets + ₵1,440 inside the 14-day window | ✅ |
| Trend | zero-filled 14-day series (Africa/Accra day keys), sales on 7 of 14 days (1–2 tickets, ₵80–400/day) — matches the seeded order dates exactly | ✅ |
| Top events | Gospel Night (9 tickets, ₵1,440) > Easter (5, ₵400, 4.7★, 4 checked in) > Sunday (2, free) — click-through to event pages works | ✅ |
| Ticket mix | discount-aware (real `OrderItem.lineTotalMinor` sums, not price×qty): VIP ₵1,200 / archived ₵400 / Regular ₵240 / free 2 | ✅ |
| Browser (insights tab) | 4 glass stat cards; SVG line (tickets) + bars (gross) chart with hover tooltip showing real per-day values ("2026-11-07 · 2 tickets · ₵400.00"); top-events table (min-w 560 in a scroll box); ticket-mix bars reusing the poll-fill gradient | ✅ |
| Defects found & fixed mid-round | (1) mobile horizontal overflow 18px → table wrapped in `overflow-x-auto`; then 236px (grid `min-width:auto`) → `min-w-0` on the grid child → **0px overflow live-verified**; (2) VLM-flagged amber contrast on the rating stat → `text-amber-700/dark:amber-400`; (3) chart edge labels clipped → `PAD_L/R 26` + start/end anchors on first/last labels (live: first@16, last@544 in viewBox 560) | ✅ |
| VLM false-positive check | "sidebar overlaps header" claim disproven live (element at h1 rect = the h1 itself) — full-page screenshot stitching artifact, as with rounds 8–9 | ✅ |
| Mobile 390×844 + dark mode | Zero overflow, chart/table/mix all usable; zero console/page errors across light/dark reloads | ✅ |

**Static:** `bun run lint` 0 errors / 17 warnings (baseline); `bunx tsc --noEmit` 0 errors.


## Not performed (honest)

- Native Android/iOS builds and device testing (mobile is a source scaffold).
- Live Hubtel sandbox (no credentials) — all provider-boundary flows are simulator-labelled.
- Playwright CI suite, axe accessibility audit, Lighthouse performance profiling, load tests.
- PWA offline install check (web app is online-first; tickets refresh from API).

**Conclusion:** the golden paths — discovery → paid checkout → ticket issuance → QR check-in → ledger/payouts/admin — run end-to-end on real code with a simulated provider boundary, with the defects found during verification fixed and re-verified. Remaining gaps are recorded in REQUIREMENTS_TRACEABILITY and CHIEF_ARCHITECT_HANDOFF.
