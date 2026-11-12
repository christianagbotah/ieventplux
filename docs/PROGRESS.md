# PROGRESS — iEventPlux build

**Branch:** `main` · **Last milestone commit:** see `git log` (docs + handoff commit).
**Status at write time:** all planned stages complete to the extent possible without external credentials; handoff delivered.

## Completed (verified)

- **Stage A:** 56-model Prisma schema; typed env validation + integration statuses; auth/sessions/elevation; permission matrices; money/fees/ledger/outbox/audit; Hubtel checkout + SMS adapters with isolated dev simulator; QR/HMAC; seed (14 users / 4 orgs / 19 events / real fulfilment paths / 38 CSS effects / synthetic posters).
- **Stage B:** Events lifecycle + discovery + visibility rules; social (follows/saves/interests/comments/reactions/reels/reports); invitations + RSVP; org profiles; organizer workspace shell.
- **Stage C:** Transactional orders + reservations; payment initiate/callback/return/status; simulator scenario page; idempotent fulfilment; late/duplicate/forged handling; QR tickets + transfers; check-in (scan/lookup/roster/offline sync w/ conflict preservation); ledger journals; refunds (+ elevation); payouts lifecycle; subscriptions via the same payment rail; Hubtel SMS + consent/quiet-hours/quotas; notifications + message queue.
- **Stage D:** Broadcasts (entitlements, playback tokens + heartbeats, key rotation), realtime chat/presence/notifications (:3003), labelled synthetic player, studio (camera preview + health + OBS ingest).
- **Stage E:** Promotions with atomic budgets; admin console (12 sections); AI concierge (text + real-time voice with real DB context); Effects Studio (38 live demos + copy code); mobile Expo scaffold.
- **Stage F:** lint/tsc clean; agent-browser end-to-end verification (purchase→ticket→QR→check-in; org verification; refund elevation; integrations truth) with 4 defects found & fixed; docs suite + traceability + test report + deployment + this handoff.

## Failing checks

None open. (`bun run lint`: 0 errors / warnings only. `bunx tsc --noEmit`: 0 errors.)

## Re-verification round 2 (post-handoff session, 2026-11-11)

- Full golden path re-run green (order `ORD-037044A7A1`, 2 × Regular ₵160 → PAID → 2 tickets + QR).
- Per-buyer limit 409 correctly enforced against a maxed account.
- Effects Studio re-verified (live demos + copy CSS/HTML + toast).
- AI text concierge re-verified against live DB context.
- **Defect fixed:** voice replies silently degraded to text — the TTS provider rejects `response_format: 'mp3'` (code 1214). Route now uses `wav` + `audio/wav`; verified with a real round-trip (TTS-generated question → ASR exact transcript → LLM → 34.3 s spoken WAV reply).
- Footer hardened for iOS safe-area + fixed mobile-bottom-nav clearance.
- Repo hygiene: runtime `.env` untracked (template recovered as `.env.example`).

## Production-polish round 3 (2026-11-11, "done" pass)

- **Homepage elevation:** "Browse all events" CTA + dedicated all-events mode; Quick find links (Today / This weekend / Free / Online); category chips now carry their DB icons (church/music/… 10/10 verified); "How iEventPlux works" 3-step strip; organizer CTA band (auth-adaptive copy, 95% organizer split surfaced); Browse-all affordances on Featured/Coming up + Reset.
- **PWA / SEO:** `public/manifest.webmanifest` (standalone, app shortcuts: Browse / Live / Tickets / Effects), apple-web-app + OpenGraph/Twitter meta in `layout.tsx`.
- **Lint hygiene:** 34 → 16 warnings, 0 errors (removed genuinely-unused disables, fixed 2 real a11y alt-text issues in RN scaffold via accessibilityLabel, restructured `submitScan` declaration-before-use instead of suppression).
- **Full authenticated sweep (agent-browser):** guest + attendee (Me tabs, Live, Reels, Effects, purchase ORD-4E157EE0D3 ₵30 → PAID → TKT-36D8153970DFF8) + organizer (8/8 tabs as chapel owner) + admin (12/12 sections) — **zero console errors platform-wide**; responsive checks at 390×844 and 1440×900.
- Milestone commit `98e7181` pushed to GitHub.

## AI + UX expansion round 4 (2026-11-11, "modern UX/UI + advanced AI" pass)

- **AI smart search ("Ask iEventPlux"):** natural-language query → LLM extracts validated filters (real category slugs/cities only) → real DB results via the shared discovery `where` builder. Labelled AI summary + humanized applied-filter chips + honest empty states. Anonymous-accessible, rate-limited 12/min.
- **AI recommendations ("Picked for you"):** user history (tickets, saves, follows) → LLM picks 4 with per-event reasons; honest degradation to "Popular right now" (real soldCount ranking) when no history or LLM unavailable — never fake personalization.
- **AI Content Studio (`/#/ai-studio`, organizer tool):** description writer (summary/markdown/tags JSON contract), social captions (WhatsApp/X/Instagram), and AI **poster generation** (864×1152 PNG via image gen) with Download + Save-to-media-library (real `POST /uploads`). Draft-first framing; facts-only guardrails in prompts.
- **Command palette (⌘K/Ctrl+K):** navigation, debounced live event search with thumbnails, theme switch, account actions (cmdk).
- **Dark/light/system theme** (next-themes, class strategy) + toggle in header; verified across hero/cards/studio in dark.
- **Modern UX polish:** confetti on PAID orders (reduced-motion aware, one-shot), animated count-up hero stats, "Selling fast"/"Sold out" badges from real quota/soldCount, For You rail, evergreen AI example chips, mobile headline spacing fix.
- Verification: `docs/TEST_REPORT.md` → "Re-verification round 3"; lint 0 errors / 17 warnings; tsc clean; all endpoints + browser flows re-verified.

### Round 4 — Effects Studio design pass (2026-11-11)

- **The studio became the design system:** `src/portal/components/EffectsRuntime.tsx` injects the full 38-effect `efx-*` catalog globally, so every portal view is styled with the exact copy-ready effects the studio demos.
- Per-view pass (all browser-verified, light+dark, 1280×800 and 390×844): aurora/gradient heroes (Discover, Auth), glassmorphism checkout + ticket panels (EventDetail, OrderView, ClaimTicket, Admin banner, Organizer KPI), ken-burns heroes (EventDetail, OrgProfile, Reels), heart-burst likes (Reels), copy-success checkmarks (OrderView, Me QR dialog, AiStudio, Reels share), floating-label + glow-focus forms (Auth, CreateOrg, checkout, chat), neon-pulse / ripple / shine-sweep CTAs, badge-ping attention dots, underline-slide navs/links, typewriter + neon-glow text moments, dual-ring/orbit/pie loaders, striped capacity bars.
- Dark-mode adaptations for light-hardcoded catalog effects live in `globals.css` (inputs, navs, toggles, buttons, grid, toast, badge ring); `prefers-reduced-motion` respected everywhere (catalog built-in + belt-and-braces block).
- Defect fixed: event title layered behind the ken-burns compositing layer (`relative z-10`).
- Verification: `docs/TEST_REPORT.md` → "Re-verification round 4" incl. a real restyled checkout (ORD-F134813A3F-A1 paid, ticket issued); lint 0 errors / 16 warnings; tsc 0 errors. Commit `75a65ae` pushed.

## Round 5 — Sold-out waitlist + calendar export (2026-11-11)

- **Waitlist (real demand capture, honest fulfilment):** new `WaitlistEntry` model (57 models now). Guests and signed-in fans join while an event is sold out; FIFO positions are computed, never stored (no drift); duplicate joins are idempotent; leaving + re-joining reactivates at the tail. Joining is only possible while genuinely sold out — the guard returns an honest 409 pointing people at available tickets otherwise.
- **Promotion without fake scarcity:** `WAITLIST_PROMOTE` (targeted, +2s) fires on refund processing and quota raises; `WAITLIST_SWEEP` (60s) is the self-healing backstop. Promotion NEVER reserves inventory — notified fans get an explicit first-come-first-served window via in-app notification + durable SMS (simulator-verified DELIVERED).
- **Defect fixed:** `processRefund` never decremented `ticketType.soldCount` — refunded seats were lost from inventory forever. Now refunded seats return to stock and wake the waitlist.
- **Calendar export:** `GET /api/v1/events/[id]/ics` produces a spec-correct VCALENDAR (UTC times, escaping, ORGANIZER, STATUS reflective of cancellations). Buttons on EventDetail hero + OrderView event card.
- **Organizer visibility:** waitlist queue (contacts, party size, per-type, status) surfaces on the event page for org members; count badge visible publicly.
- Verification: `docs/TEST_REPORT.md` → "Re-verification round 5" (full API matrix + browser sweep light/dark, both viewports, zero console errors); lint 0 errors / 16 warnings; tsc 0 errors.

## Round 6 — Recurring series tooling (2026-11-11)

- **Create with weekly repeat:** `POST /events` accepts `repeatWeeks` (1–26) → creates the `EventSeries` (previously schema-only, no write path existed) + DRAFT occurrences +7d each with preserved duration; organizer publishes each individually. UI toggle in the create dialog.
- **Apply to future occurrences:** `POST /events/[id]/apply-to-series` bulk-propagates whitelisted content fields (title/summary/description/category/cover/city/directions/contacts/accessibility/rules/age/refund) and optionally adopts the source's local time-of-day + duration, correctly resolved in the event timezone (Intl offset math). Never touches started/ended/cancelled events. UI: field-chip dialog from any series event's editor.
- **Public series awareness:** `GET /events/[id]/series` + "Weekly series — next date …" chip on the event page linking to the nearest future sibling; "Series" badges in the organizer events list.
- **Defects fixed:** (1) the "New event" button could never open the editor (render gate bug, pre-existing); (2) hash-router hydration mismatch on every deep-link load — `useRoute()` now hydrates at `/` and resolves the real hash post-mount, eliminating the console error and double-render platform-wide.
- Verification: `docs/TEST_REPORT.md` → "Re-verification round 6"; lint 0 errors / 17 warnings (intentional mount-sync); tsc 0 errors.

## Round 7 — AI weekend planner (2026-11-12)

- **`POST /api/v1/ai/planner` (anonymous, 8/min):** window (this weekend / next weekend / next 7 days) + city + party size (1–12) + budget + up to 3 interests → day-by-day itinerary. Candidates come from the real public catalogue (`PUBLISHED|LIVE`, window-clipped, optional city filter, take 40); every LLM pick is validated against the DB and **re-bucketed onto the event's true date** — the model's claimed dates are never trusted, invalid ids are dropped, ids deduped, picks capped at 3/day, ordered chronologically.
- **Honest budget math (server-side, never LLM):** per-pick estimate = cheapest active ticket; total = Σ × partySize. Over-budget plans survive with an explicit note ("swap a pick or trim the party"). Sold-out picks keep a "Sold out · waitlist" chip — waitlist-first honesty carried into the planner.
- **Honest degradation:** LLM failure/invalid JSON → demand-ranked fallback (real soldCount) with a labelled amber note; empty windows/cities return `{empty:true}` with a truthful summary — zero fabricated events anywhere.
- **Planner UI (Discover hero "Plan my weekend" CTA → sheet):** aurora stage + gradient headline + new short kicker, window chips, city select fed by `GET /discovery/home` (now also returns real `cities`), party stepper, floating-label budget input, interest chips from live categories, shine-sweep CTA; result renders summary callout, striped budget bar (emerald within / amber over budget), gradient day labels, pick cards (time range, city, real price, AI reason, waitlist chip) that navigate to the real event, and a **client-side RFC-5545 .ics download** of the whole plan with escaped text + real DTSTART/DTEND.
- **Polish loop via VLM screenshot review:** fixed hero kicker wrap at 390px, hard aurora-to-body edge (soft gradient transition), low-contrast close button over the dark hero (glass pill, themed for both modes).
- Verification: `docs/TEST_REPORT.md` → "Re-verification round 7" (API matrix + budget/city/rate-limit/empty cases + desktop & mobile browser runs + VLM design review); lint 0 errors / 17 warnings; tsc 0 errors.

## Round 8 — Live engagement suite (2026-11-12)

- **Realtime polls + audience Q&A for LIVE events** (5 new models; 62 total). Event pages now carry a `LiveEngagement` panel (glass card, LIVE badge-ping radar dot, poll/Q&A pill tabs): attendees vote in one tap (results unlock after voting, honest "vote to see live results" teaser), ask questions, upvote; organizers get an inline composer (2–6 options), open/close controls (opening auto-closes siblings; requires event LIVE), live answering, pin/hide moderation. Organizer workspace gains a **Live Room** tab listing live events with engagement stats.
- **Honest rules:** one vote per signed-in person per poll (unique index → 409, race-safe); own-question upvoting disabled; DRAFT polls + HIDDEN questions are organizer-only; closed polls are final; Q&A accepted around PUBLISHED|LIVE events only.
- **Realtime wiring:** shared `realtimeEmit` trusted-egress helper (`src/server/services/realtime.ts`); rooms `event:{id}`; broadcasts `poll:update` / `poll:closed-others` / `poll:vote` / `qa:new` / `qa:update` / `qa:upvote`. Broadcasts always carry **server-recomputed tallies** (`completeView`) — a mid-round defect (zeroed tallies + lost per-viewer markers) was found in cross-client verification and fixed; clients also preserve `myOptionId`/`myUpvote` locally, and a 30 s resilience refetch self-heals stripped-websocket proxies.
- **Pre-existing defect fixed:** broadcast chat POST never relayed through `/emit` (comment claimed it did) — live chat never rendered live. Now relays the confirmed message to `broadcast:{id}`; client dedupes by id with local-append fallback.
- **Design:** poll result bars (gradient fills, leader sheen `ievx-poll-fill--lead`, per-viewer checkmark, "Leading" only when a runner-up exists), shine-sweep organizer CTAs, `iefx-msg-in` entrance for questions; all guarded by `prefers-reduced-motion`. Glass header legibility tuned (85% + blur 16px).
- Verification: `docs/TEST_REPORT.md` → "Re-verification round 8" (API matrix + raw-socket relay proof + **two-session cross-client browser runs through the :81 gateway** + mobile 390×844 + VLM review); lint 0 errors / 17 warnings; tsc 0 errors. Repo hygiene: accidental UUID-named commit dropped; `db/*.shm`/`*.wal` untracked.

## Round 9 — Post-event ratings & reviews (2026-11-12)

- **`EventReview` (63rd model) closes the event lifecycle:** discover → attend → review → social proof for the next discovery cycle. Honest gating: reviews open only for **ENDED** events and only for **fulfilled ticket holders** (paid and free-fulfilled orders both land at `PAID`); one review per attendee (`@@unique(eventId,userId)`) with **edit semantics** on re-POST (opinions may change — no duplicate rows); organizer hide/restore moderation (audited); authors retain visibility of their own hidden reviews; aggregates always count VISIBLE reviews only.
- **Surfacing:** event page hero gains an "Attendee rating" stat; a full **Reviews panel** (gradient aggregate headline, 5→1 distribution bars reusing the poll-fill gradient language, star-composer with hover preview, "Verified attendee" badges, org moderation controls) sits below Discussion; discovery listings carry `ratingAvg`/`ratingCount` via a server-side `withRating` aggregate computed inside the same query (no N+1); EventCard renders the star chip.
- **Seed:** 3 fulfilled historical orders + 3 reviews (5/4/5) on the ENDED Easter production — seeded through the real `createOrder` + paid-fulfilment services with the event temporarily PUBLISHED during seeding (archived sales honesty).
- **Defects found & fixed mid-round:** (1) reviews GET passed the raw slug as eventId → empty listings via slug; (2) hidden reviews vanished from their author's own query; (3) section anchor scrolls landed under the sticky glass header → `scroll-margin-top: 84px`. Ops: corrupted Turbopack cache (from killed processes) diagnosed + wiped; stale zombie server cleaned.
- Verification: `docs/TEST_REPORT.md` → "Re-verification round 9" (API eligibility/moderation matrix + browser flows guest/author/organizer incl. live aggregate recompute + mobile); lint 0 errors / 17 warnings; tsc 0 errors.

## Round 10 — Organizer insights: real analytics (2026-11-12)

- **`GET /orgs/[id]/insights` + Insights workspace tab (TrendingUp nav):** analytics derived ONLY from real transactional rows — settled orders, issued tickets, admission scans, VISIBLE reviews, active waitlists. Nothing invented: no page-view or "engagement" numbers (the honesty contract is in the service header).
- **Surfaces:** 4 glass stat cards (tickets sold w/ window delta, settled gross, check-in rate with scan math, avg rating); a 14-day SVG chart (smoothed line for tickets + bars for settled gross, hover tooltip with real per-day values, Accra-local day keys, edge-safe labels); top-events table (tickets/gross/checked-in/rating, click-through); ticket-mix bars using **discount-aware** `OrderItem.lineTotalMinor` sums; honest waitlist-demand callout when > 0.
- **Seed realism:** 5 additional real orders (createOrder + paid-fulfilment) backdated across the fortnight; existing orders settled onto the window; Easter orders pre-date their event; 4 of 5 Easter tickets checked in with real `AdmissionScan` rows (25% org check-in rate).
- **Defects found & fixed mid-round:** mobile overflow (grid `min-width:auto` vs table min-w → `min-w-0` + scroll box → 0px verified); amber rating-stat contrast (→ amber-700/400); chart edge-label clipping (PAD_L/R + start/end anchors). VLM "sidebar overlap" claim disproven live (screenshot stitching artifact).
- Verification: `docs/TEST_REPORT.md` → "Re-verification round 10" (API payload matrix + browser incl. hover tooltip + mobile/dark + VLM); lint 0 errors / 17 warnings; tsc 0 errors.

## Round 11 — Organizer updates & audience reach (2026-11-12)

- **The event's operational voice became real.** `EventUpdate` (previously a bare inline POST that notified only ticket holders) is now a service with an explicit reach contract: audience = ticket holders ∪ fulfilled-order buyers ∪ organization followers, deduplicated by user, author excluded — followers finally get value from following. In-app notifications always; **SMS is reserved for `important` updates** (time/venue/safety — real transactional need), sent durably via the message queue with dedup per update+target, including guest buyers who left a phone but have no account.
- **Honesty rails:** posts only while an event is PUBLISHED/SCHEDULED/LIVE/POSTPONED; 6-per-hour rate guard (409 with a truthful message); audited post/delete; open event pages receive `update:new`/`update:removed` over the :3003 relay (best-effort, API stays the source of truth); composer returns real reach stats ("3 people notified · 3 SMS queued").
- **UI:** new `UpdatesPanel` on the event page — inline org composer (title, body, important switch), important cards carry a red badge + border accent, org delete controls, socket-driven live updates with a 30s resilience refetch; attendees see a clean timeline. Seeded realistic updates on the two LIVE events (one important).
- **Defects found & fixed mid-round:** (1) mobile 390px horizontal overflow 15px — bare `grid gap-6 lg:grid-cols-[1fr_360px]` without a base `grid-cols-1` lets the implicit track size to content min-content (computed 388.7px inside a 358px grid) → fixed locally + scoped global guard `.grid:not([class*="grid-cols"]) > * { min-width: 0 }`; (2) composer CTA inherited the gold `efx-shine-sweep-button` catalog gradient over the emerald theme → dropped. VLM claims (toggle misalignment, header clip) disproven live, as in rounds 8–10.
- **Ops hardened:** dev server binds dual-stack (`-H ::`) so the Caddy gateway's IPv6-first `localhost` dial reaches it (was returning 502); services launched in `(cd … && setsid nohup … & disown)` subshells survive tool-invocation boundaries (naive backgrounding does not). Documented in TEST_REPORT ops note.
- Verification: `docs/TEST_REPORT.md` → "Re-verification round 11" (API matrix incl. 401/403/409, cross-client live arrival + live delete via two browser sessions through the :81 gateway, bell unread, SMS DELIVERED receipts, mobile/dark, VLM review); lint 0 errors / 17 warnings; tsc 0 errors.

## Round 12 — Refund lifecycle closed: buyer requests, org decisions (2026-11-12)

- **The buyer finally has a voice in the money loop.** `POST /orders/[ref]/refund-request`: signed-in buyer only (guest orders → truthful 403), event-not-ended guard (409), reason ≥ 10 chars sanitized, one open case per order (409), 6/hour rate guard, audited; OWNER/ADMIN/FINANCE members get a `REFUND_REQUESTED` bell pointing at Finance → Refund cases.
- **Org decisions, two-party money governance:** `refund-approve` (REQUESTED → APPROVED, buyer notified "money reversal in progress") and `refund-reject` (REQUESTED/APPROVED → REJECTED with a truthful note the buyer sees; order restored PAID — PARTIALLY_REFUNDED-aware when prior partials exist). The org id in the URL is a scope, never an authorization: the case is resolved to an org's own order first (foreign caseId → 404). The platform (admin, elevated + audited) still executes money — APPROVED ≠ money moved.
- **Real defect found & fixed:** `processRefund` would execute a `REJECTED` case (double-spend) — now only REQUESTED|APPROVED can process, everything else 409s.
- **Surfaces:** order page Refund card (composer gated to PAID/EXCEPTION_REVIEW/PARTIALLY_REFUNDED + upcoming + no open case; amber "review in progress" state; REFUND HISTORY with organizer notes, PROCESSED/REJECTED chips, MANUAL_TRACKED honesty line); Finance inbox upgraded — event title, buyer vs staff-opened (computed server-side, same round trip), awaiting-decision badge, approve / decline-with-note inline editor, policy microcopy.
- **Seed realism:** Akua's REJECTED case created through the real `requestRefund → rejectRefund` services; Kojo's REQUESTED case awaits a decision by default.
- **VLM-adjudicated defect fixed:** voice-concierge FAB corner-grazed mobile form inputs (31×15 px, live-rect-proven) → hides while any input is focused (opacity/pointer-events/tabIndex, md+ unaffected; async-verified 1→0→1). All other VLM claims (header clip, toast overlap, nav overlap, paragraph truncation) disproven live — mid-scroll glass effects and transient overlays.
- Verification: `docs/TEST_REPORT.md` → "Re-verification round 12" (API matrix incl. 401/403/409/404-scope, reject + approve→process→ledger-reversal balanced 20000=20000, two-session browser flows through :81, mobile 390, dark); lint 0 errors / 17 warnings; tsc 0 errors.

## External blockers

Hubtel checkout/Send Money/SMS credentials + merchant agreement; Cloudflare Stream credentials; SMTP relay; Apple/Google store accounts. All truthfully surfaced at `/api/v1/health` and Admin → Integrations. ~~git remote~~ **resolved 2026-11-11:** remote `github.com/christianagbotah/ieventplux` configured and pushed (`main`, upstream tracking set; every verified milestone is now committed and pushed).

## Next tasks for the next engineer/session

1. ~~Connect a git remote and push~~ ✅ done 2026-11-11 — remote `https://github.com/christianagbotah/ieventplux.git`, branch `main` pushed with full Stage A–F history; ongoing convention: commit and push each verified milestone.
2. Obtain Hubtel credentials → run the sandbox verification protocol in `docs/PROVIDER_CAPABILITIES.md` (re-verify v1 endpoints first).
3. Migrate to PostgreSQL for concurrency (`docs/ARCHITECTURE.md` migration path) + add load/concurrency smoke tests.
4. Add automated test suite (jest integration + Playwright journeys from TEST_REPORT E1–E14).
5. Native dev builds for mobile broadcasting + store billing configuration.
shared-store rate limiting when scaling beyond one instance.

## Commands to resume

```bash
bun run dev                                   # :3000
(cd mini-services/worker && bun run dev &)    # :3001
(cd mini-services/realtime && bun run dev &)  # :3003
bun run db:seed   # optional reset of dev data
```
