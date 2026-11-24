# iEventPlux experience parity: public web, native Android, native iOS

**Product rule:** There must be one iEventPlux product experience, not a richly featured web portal plus a visually unrelated mobile companion. Native layouts adapt to small screens and OS affordances while preserving design semantics, route names, content, feature results, authorization and vocabulary.

## Authoritative baseline

The current public web React SPA is the UI reference: `src/portal/AppPortal.tsx`, `src/portal/views/Discover.tsx`, `src/portal/components/EventCard.tsx`, `src/portal/components/HeroSpotlight.tsx`, and brand tokens in `src/app/globals.css`. The native Expo app is under `mobile/`.

## Audit and remediation (this increment)

| Experience | Previous Android | Updated implementation | Outstanding certification |
| --- | --- | --- | --- |
| First screen | Login gate despite public web discovery | Public Discover at launch; secure tickets/account behind sign-in | Physical-device launch/restart |
| Primary navigation | Five tabs (Explore, Live, Shops, Tickets, You), web had six with Feed and Reels | Same six web labels: Discover, Feed, Reels, Shop, Tickets, Account; live from header/hero | Phone width, large font and safe area |
| Brand app bar | Generic page-title text | Native ticket monogram and iEvent/Plux split wordmark | Visual screenshot comparison |
| Semantic colors | Mobile-green and neutral values diverged from web CSS | Native colors match the web `--ievx-*` light palette | Dark theme and accessibility contrast remain |
| Homepage hero | Different static slogan | Web's three editorial stories, slide controls, 6.5-second rotation, reduced-motion respect and actual featured event | Transition smoothness, pause on background, pixel checks |
| Event cards | Small horizontal list and white-content featured card | Larger imagery, overlay metadata and marketplace-like event cards; featured artwork overlay | Cross-device image crops and fallback artwork |
| Following | Absent | Native timeline uses existing authenticated `/social/feed` with cursor paging, refresh and real public organizer updates only | Follow-management parity and device UAT |
| Reels | Absent | Native server-backed event preview gallery from `/discovery/reels`, reaction and OS share; explicitly **not** claimed as true video playback | Production media pipeline, verified videos, scroll performance and moderation |
| Live | Separate basic page | Existing native Live hub and broadcast navigation retained | Camera, microphone, SFU and join device UAT |
| Tickets | Existing offline-QR wallet | Existing wallet retained; accessible via matching Tickets tab | Purchases, restored offline QR, update migration tests |
| Shop | Existing native store catalogue | Existing catalogue retained; matching Shop tab | Native merchant management, checkout and delivery flows |
| Organizer/admin | Mostly web-only | Explicit browser handoff; do not misrepresent as native | Build full native organizer/editor/admin workflows |

## Guardrails

- `mobile/src/lib/web-parity.test.ts` compares web mobile nav labels, all three hero stories and public brand palette to native contracts. Update both sides deliberately if product design changes.
- Never show synthetic activity, fabricated reels, nonexistent attendees or unverified live sessions.
- Do not imply server APIs exist for features not implemented. Native app should use the same authorized endpoints and payment confirmations as web.
- A code push is **not** a native mobile update. Require green CI, a verified signed Android APK, published release metadata and physical-device signoff.
- iOS also needs independent signing, installation, permissions and App Store/TestFlight testing before any iOS parity claim.

## Further parity required before mobile release readiness

1. Real playable video feed, follow recommendations, social notifications, content composition and moderation.
2. Public discover filter breadth (country/city/date/price/online) and on-device personalized recommendations and AI discovery.
3. Organizer event editor, guest/artist lineup, ticket tiers, souvenirs, orders, ownership and management tools.
4. Seller studio, product inventory, checkout and delivery, payment and refund integrations where supported.
5. End-to-end physical Android and iOS QA: tap targets, screen readers/large text, portrait/landscape, camera/microphone permission, LiveKit meetings, joining as another account, tickets and install/update continuity.
6. Dark-mode parity and shared per-platform screenshot baselines.

**Status:** This increment is a foundation for parity; it is not a declaration of complete Android/iOS feature parity or production readiness.

## Second increment: native discovery filters and Android QA update freshness

- Native Discover now has a proper modal filter drawer, quick chips and active-filter indicators for **date window, entry price, online/hybrid/physical access, category, country and city**. It uses the same server-backed `/events` query vocabulary as the public web, including `access=ONLINE` for online + hybrid gatherings, and carries the attendee's time zone.
- Search uses a debounced full server catalogue; stale in-flight queries cannot overwrite newer filters. Filter failures no longer show potentially inaccurate homepage matches. Pagination loads more genuine results and preserves the loaded list if a later page fails.
- Country suggestions use `/discovery/locations`; when unavailable, the rest of the search remains usable.
- The public Android QA index now forces a dynamic route and bypasses Next.js's persistent fetch cache while deduplicating concurrent lookups using a short **two-minute** in-process cache. Its responses are marked `no-store`. A test asserts the fetch/cache contract and newest verified asset selection. The GitHub release and valid APK asset remain authoritative; this does not enable silent Android installs.
- Pending: successful GitHub CI and signed APK publish, deployment of the changed web route to the existing authorized environment, and physical-device testing of filters, keyboard/scroll, update prompts and data migration.
