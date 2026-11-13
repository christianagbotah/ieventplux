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
  - `945d038` — AI + UX expansion: AI smart search, personalized recommendations, AI Content Studio (writer/captions/poster), command palette, dark mode, selling-fast signals.
  - `75a65ae`/`bcc44d5` — Effects Studio became the design system: full 38-effect catalog applied across every portal view (round-4 pass, light+dark, both viewports).
  - Round 5 (this session): sold-out waitlist (guest join, FIFO, honest FCFS promotion via WAITLIST_PROMOTE/SWEEP + SMS), refund-frees-inventory fix, .ics calendar export, organizer waitlist visibility. See TEST_REPORT round 5.
  - Round 6 (this session): recurring series (create with weekly repeat → EventSeries + DRAFT occurrences; apply-to-future-occurrences with tz-correct time adoption; public next-date chip) + two defect fixes: "New event" editor never opened (pre-existing render-gate bug) and hash-router hydration mismatch on all deep links.
  - Round 7 (`170b2fc`, 2026-11-12): AI weekend planner — `POST /ai/planner` (window/city/party/budget/interests → day-by-day itinerary; every LLM pick validated against the DB and re-bucketed onto the event's true date; server-side budget math from real ticketTypes; demand-ranked honest degradation; empty-city truthfulness; 8/min rate limit) + PlannerPanel sheet on the Discover hero (aurora stage, floating-label budget, shine-sweep CTA, striped budget bar, .ics plan download) + `GET /discovery/home` now returns real `cities`. VLM screenshot review loop applied (mobile + desktop). TEST_REPORT round 7.
  - Round 8 (`250002b`, 2026-11-12): live engagement suite — realtime polls + moderated audience Q&A on live event pages (`LiveEngagement` panel: one-tap voting with vote-to-reveal results, organizer composer/open/close with auto-close-siblings + LIVE-only opening, live answers, pin/hide moderation; "Live Room" workspace tab with engagement stats) on 5 new models (62 total) + `event:{id}` rooms via a shared `realtimeEmit` egress helper. **Pre-existing defect fixed:** broadcast chat never relayed through `/emit` (live chat never rendered live). Cross-client verification ran two browser sessions through the :81 gateway; a mid-round broadcast-payload defect (zeroed tallies, lost per-viewer markers) was found and fixed (`completeView` + client-side marker preservation + 30 s resilience refetch). Repo hygiene: accidental UUID-named commit dropped; SQLite WAL/SHM artifacts untracked. TEST_REPORT round 8.
  - Round 9 (this session, 2026-11-12): post-event ratings & reviews — `EventReview` (63rd model) closes the lifecycle (discover → attend → review). Honest gating (ENDED event + fulfilled ticket; one editable review per attendee; VISIBLE-only aggregates; org hide/restore with audit; authors keep sight of own hidden reviews). Surfaces: hero "Attendee rating" stat, Reviews panel (distribution bars + star composer + Verified attendee badges + moderation), `withRating` aggregates on discovery listings (no N+1), EventCard star chip. Three mid-round defects found & fixed (slug-as-eventId, author visibility of hidden rows, anchor scroll-margin under sticky header). TEST_REPORT round 9.
  - Round 10 (this session, 2026-11-12): organizer insights — `GET /orgs/[id]/insights` + Insights workspace tab; analytics derived only from real transactional rows (settled orders, tickets, scans, reviews, waitlists — no invented page-view metrics); 14-day SVG sales chart (tickets line + gross bars, hover tooltips), stat cards, top-events table, discount-aware ticket mix; seed gains a realistic sales fortnight (5 more real orders backdated) + 4 real check-in scans. Three mid-round defects fixed (grid min-width overflow, amber contrast, chart edge labels). TEST_REPORT round 10.
  - Round 11 (this session, 2026-11-12): organizer updates & audience reach — `src/server/services/updates.ts` (+ `important` schema flag, `DELETE /events/[id]/updates/[updateId]`, `UpdatesPanel` on event pages): audience = holders ∪ fulfilled buyers ∪ followers (dedup, author excluded); SMS only for important updates (durable + deduped, guests-with-phone included); `update:new`/`update:removed` relayed live; 6/hour rate guard; audited. Followers finally get value from following. Two mid-round defects fixed (bare-grid min-content overflow at 390px — local + scoped global guard; gold catalog CTA overriding the theme). Ops hardened: dev binds `-H ::` for the Caddy gateway's IPv6 dial; subshell+setsid launch pattern documented. TEST_REPORT round 11.
  - Round 12 (this session, 2026-11-12): refund lifecycle closed — `POST /orders/[ref]/refund-request` (buyer-only, event-not-ended, one-open-case, rate-guarded, audited; finance-role bells) + org decisions `refund-approve`/`refund-reject` (scope-checked caseId→404, truthful note to buyer, order restored PAID/PARTIALLY_REFUNDED-aware) + `processRefund` hardened (REJECTED/terminal cases can no longer execute — real double-spend defect). Two-party governance preserved: org decides, platform executes money. Order page Refund card + upgraded Finance inbox (buyer vs staff-opened, awaiting-decision badge). VLM-adjudicated mobile defect fixed (voice FAB hides while inputs are focused). TEST_REPORT round 12.
  - Round 13 (this session, 2026-11-12): offline ticket wallet + connection resilience — opened tickets persist client-side (localStorage: list `ievp.tickets.v1` + per-ticket `ievp.ticket.{id}`, 30-entry trim) so the QR reopens with an honest "Offline copy · saved X ago" badge when the network is dead; unsaved offline opens get a truthful toast instead of a pretense. Conservative service worker v2 (`public/sw.js`): cache-first only for content-hashed assets, navigations/identity network-first with cache rescue on hard failure only (slowness is never a cache trigger), 4 s race on wallet reads; `ConnectionStatus` offline banner under the sticky header. Two pre-existing defects fixed: signed-in refresh bounce (hard reload on private routes hit `navigate('/signin')` before session bootstrap → `booted` flag gates Me/OrganizerWorkspace/AdminConsole/CreateOrg) and the first SW draft serving a stale cached shell during recompiles (cache version bumped). TEST_REPORT round 13.
  - Round 14 (this session, 2026-11-12): Hubtel live-connect + organizer AI advisor — `src/server/hubtel/credentials.ts` resolves credentials per request (super-admin DB values via Admin → Integrations override env; masked, audited, write-only) and the payments/SMS simulator gates are dynamic, so pasting real keys switches checkout live without a redeploy; `POST /admin/hubtel/probe` runs one real GHS 1.00 initiate and persists an empirical verdict + response snippet for v1-contract calibration (docs page needs a phone-OTP login this environment cannot complete — stated, not faked). AI robustness: shared pipeline `src/server/ai/llm.ts`; org-scoped `POST /orgs/{id}/ai-advisor` (finance-role, 8/min) with `pricing` (LLM proposals validated against the org's real ticket types + price bounds, honest `heuristic fallback` label, advisory-only) and `digest` (narrative over real insights, template fallback); DB-honest order cross-sell `GET /orders/{ref}/suggestions` ("Because you're attending X" — same category/city, no LLM, no paid placement). TEST_REPORT round 14.
  - Round 15 (this session, 2026-11-12): payout loop closure + AI trust layer + organizer ops — `PAYOUT_STATUS_POLL` worker sweep polls SUBMITTED payouts via the Send Money status probe (`checkSendMoneyStatus`): SUCCESS → PAID + hold released + owner bell, FAILED → reversal + honest note, 404/unreachable NEVER fabricates a verdict (`STATUS_ENDPOINT_UNVERIFIED`, manual confirm stays, 20-check bound); payments simulator now simulates Send Money (`SIM-` refs) so the full payout lifecycle runs credential-free; checkout retry hardening — stale (>30 min) REDIRECTED/PENDING attempts and `?cancelled=1` returns are marked EXPIRED and a FRESH session is created instead of replaying a dead URL (late SUCCESS callback still fulfils — status never gates money). AI: review digest `GET /events/{id}/review-digest` ("What attendees say" card, grounded in VISIBLE reviews, fingerprint-cached, source-labelled AI vs stats) and moderation triage `POST /events/{id}/moderation-triage` (org-only, advisory chips, returned ids validated against fetched rows, honest UNAVAILABLE fallback). Features: "Remind me" bell (`EventReminder`, 65th model — opt-in alerts ~24 h before for fans without tickets, dedup-safe sweep) and audited attendee CSV export (`GET /events/{id}/export`, org-only, foreign-org 403). TEST_REPORT round 15.
  - Round 16 (2026-11-13): user-reported overlap fix + SW dev-staleness root cause — a submitted screenshot of the organizer header exposed two measured defects: portal page titles inherited the public-hero `iefx-headline` CSS (unlayered `clamp(1.9rem, 4.6vw, 3.1rem)` + line-height 1.12 overriding Tailwind `text-xl`) so headings ballooned and glyph descenders spilled onto subtitles; the org `SelectTrigger` (`w-fit` + `whitespace-nowrap`) overflowed the 240px sidebar card by ~106px with long org names. Fixes: new compact `.iefx-page-title` adaptation-layer variant (1.25rem / line-height 1.35, `--lg` 1.5rem) behind all 13 workspace headings + AI studio; `w-full` on the trigger. Deeper root cause: **SW v2 cached all `/_next/static/` cache-first while dev chunk URLs are stable module ids served `no-store` — after any recompile the worker served yesterday's compile** (the submitted screenshot itself was a stale render); SW v3 `cacheFirstImmutable` caches `/_next/static/` only when the response declares `Cache-Control: immutable` (production content-hashed chunks — offline unchanged), dev chunks never cached; cache version bumped. Lesson for the effect-class system: hero-catalog sizing and utility sizing fight via cascade layers — the adaptation layer now ships per-context variants (hero `iefx-headline` / compact `iefx-page-title`). TEST_REPORT round 16.
  - Round 17 (2026-11-13): user-reported hydration mismatch root-caused to the SW v2→v3 handoff load (fresh HTML + previous-build cached chunks → radix `useId` attribute mismatches; clean-browser verification proves the current build hydrates with byte-identical ids) — takeover made deterministic for the future (module-scope `controllerchange` listener + `hadController`-gated single reload in `ConnectionStatus`), `CommandDialog` sr-only title/description moved inside `DialogContent` (closed-dialog hydration surface 3 ids → 1), `allowedDevOrigins: ["*.space-z.ai"]` silences the preview-origin dev warning. Git credential restored (PAT in `~/.git-credentials`, outside the repo) and rounds 14–16 + snapshot pushed. TEST_REPORT round 17.
  - Round 18 (2026-11-13): pointer affordance + professional hero arrangement — a base-layer `cursor: pointer` rule (links, unclassed buttons — Tailwind v4 preflight leaves them at `default` — and Radix role-only widgets) plus replacing shadcn's utilities-layer `cursor-default` on menu/cmdk/Select items; the hero CTA set became an edge-aligned grid on mobile/tablet (primary full → two equal halves with responsive labels → live CTA full) relaxing to one row at lg; pre-existing 768–1023px header overflow (+49px) fixed via icon-only nav pills in the md–lg band (scrollWidth == viewport at 390–1280). Ops lesson: Turbopack's persistent cache served a stale compiled CSS chunk across restarts — `rm -rf .next` is the recovery when a CSS rule "does not apply" in dev. TEST_REPORT round 18.
  - Round 18b (2026-11-13): user follow-up superseded the round-18 hero grid ("buttons too big, covering the entire hero" — all four CTAs and the three stat pills now hold ONE compact row each on phones/tablets) — three-tier responsive labels/sizes (<sm short copy on h-8 pills, sm–lg medium copy on h-9, ≥lg the roomy full-copy row), `.iefx-hero-cta` adapter tiers in globals.css retuning the catalog neon button per breakpoint (inline-style override removed; 0,2,0 specificity beats the injected catalog CSS), `iefx-stage--hero` slimmer mobile stage gutters, flex-wrap safety net (320px wraps 3+1, zero overflow). DOM-measured single rows at 390/768/1280; all four CTA behaviours re-clicked; VLM screenshot QA passes. Lesson reaffirmed: breakpoint tiers belong in `iefx-*` adapter rules, not view-code inline styles. TEST_REPORT round 18b.
  - Round 19 (2026-11-13): compact professional home page per user report — AI search field + submit in ONE row at every viewport (compact panel, "Ask" label <sm); event banners portrait 3/4 → landscape 16/10 globally (two hidden bugs fixed on the way: shadcn Card base `gap-6 py-6` added 48px invisible padding per card — killed with `gap-0 py-0`; promo thumbs now absolute-positioned so body height drives the row); "Promoted for you" became a 112px compact native-ad horizontal rail with small thumbs; scroll-margin defect fixed (unlayered `section[id]` blanket rule beat every `scroll-mt-*` utility — hero "AI" CTA landed the panel under the sticky filter bar; rule scoped to the four classless anchors); headline re-capped at 2.3rem (4 ragged lines → 2 clean); compaction pass across sections/grids/how-it-works/organizer CTA. Turbopack stale-CSS defect recurred ×2 (rm -rf .next + restart — now standing procedure for globals.css edits). TEST_REPORT round 19.
  - Round 19b (2026-11-13): workspace sidebar independent scroll + compact gross-sales card per user report — the organizer sidebar is now internally scrollable and viewport-bounded (`overflow-y-auto overscroll-contain ievx-scrollbar` + `md:max-h-[calc(100vh-6rem)]` under the existing sticky top-20; page scroll keeps it pinned with internal scrollTop preserved, sidebar scroll never moves the page — geometry-proven both directions, last nav item reachable on short viewports). Gross-sales glass card: new `.iefx-gross-card` adapter (outer padding 1.75→0.55rem, panel `flex:1` column-centered, value 3xl→xl, title →0.7rem, icon for sibling parity — all four stat cards measure identical 134px boxes; inline fontSize override removed from view code). Three defects found & fixed during verification: (1) **`.ievx-view-enter` fill-mode `both` retained an identity transform → containing block for `position:fixed` descendants** — the mobile workspace overlay was glued to the view wrapper (1474px) instead of the viewport and drifted off-screen when opened after scrolling (fill → `backwards`, keyframes end at natural state so visually identical; affects any fixed element inside a view wrapper); (2) voice-concierge FAB covered the footer's "CSS Effects Studio" link at page bottom (footer inner `pr-20` = FAB footprint); (3) dashboard "Next events" grid items lacked `min-w-0` → 104px horizontal overflow at 390px. VLM false positives dissected (flash-glow ring read as card-size mismatch; devtools "N" button read as avatar overlap — DOM disproves both). Turbopack stale-CSS struck a 3rd time, mid-session between two globals.css edits. TEST_REPORT round 19b.
  - Round 20 (2026-11-13): Effects Studio removed from every customer-facing entry point per user report — the shared `NAV` array (desktop top nav + mobile bottom nav), the footer link row and the ⌘K palette "Go to" group all dropped their dev-tool entry; `#/effects` route + view + `EffectsRuntime` catalog retained as a direct-URL internal dev tool (the `efx-*` classes still power the whole app; unused `Palette` imports removed). Staff sign-in routing added as the concrete answer to "how will system admin login?": `AuthView.finishAuth()` sends SUPPORT/MODERATOR/FINANCE_ADMIN/SUPER_ADMIN sessions straight to `#/admin` with a role-naming toast (captured in-DOM) + a muted staff hint under the sign-in card; non-staff keep the Discover landing (regression-tested with an org-owner account). The backend answer to "are you building the backend too": already real — `/api/v1/auth/login` httpOnly-cookie sessions (bcrypt, rate limits, audit, 10-min elevation for finance), seeded staff accounts (`admin@ieventplux.dev` SUPER_ADMIN etc., `Dev@12345`), 12-section console on real `/api/v1/admin/*` + Prisma. Browser-verified: nav/footer/palette text sweeps, `#/effects` by-URL render, staff golden path, non-staff regression, mobile bottom nav, zero console/page errors. TEST_REPORT round 20.
  - AI + UX expansion (round 4): AI smart search (`/ai/search`), AI recommendations (`/ai/recommend`), AI Content Studio (`/ai/studio` + `/#/ai-studio` incl. poster image generation), command palette (⌘K), dark/light theme, confetti + selling-fast signals. Verified in TEST_REPORT round 3.
- **Branch:** `main` · **Working tree:** clean at handoff.

## 2. What actually runs (verified)

| # | Capability | Status |
|---|---|---|
| 1 | Public discovery with filters, sponsored placements (labelled), series, visibility rules | ✅ Runs |
| 2 | Auth: register/login/logout, sessions + revocation, password reset, contact verification, elevation for privileged finance | ✅ Runs |
| 3 | Event lifecycle with enforced transitions + attendee notifications on cancel/postpone | ✅ Runs |
| 4 | Orders with transactional inventory holds (15-min), quota invariants, buyer limits, group discounts, codes | ✅ Runs |
| 5 | Hubtel v1 checkout adapter + **isolated dev simulator** with success/failure/forged-amount/late/duplicate/no-callback scenarios; durable callbacks; idempotent fulfilment; amount verification; ≥5-min bounded reconciliation; **round 14: admin-console credentials (DB over env, dynamic simulator gate) + one-click connection probe** | ✅ Runs (simulator boundary; live on saved keys) |
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

### Design system note (round 4)

The Effects Studio (`/#/effects`) is not a demo appendix — its 38-effect catalog (`src/data/css-effects.ts`) is the portal's actual design system. `src/portal/components/EffectsRuntime.tsx` injects the catalog CSS globally at the shell level; views compose with `efx-*` classes; `src/app/globals.css` carries the in-app adaptation layer (`iefx-*` helpers + `.dark .efx-*` theme adaptations). When adding a new view, pick effects from the catalog first; when adding a new effect, add it to the catalog so it lands in both the studio and the runtime.

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
| Offline ticket wallet + service worker | ✅ opened tickets scannable offline (localStorage + conservative SW v2, round 13); full offline shell boot best-effort |
| Docs | ✅ full suite incl. traceability, test report, deployment, this handoff |
| Git | ✅ `main` pushed to `github.com/christianagbotah/ieventplux` (PAT outside repo) |
