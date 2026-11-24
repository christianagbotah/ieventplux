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

## Third increment: native event detail programme parity

The native `EventDetailScreen` now displays the **same server-approved event information** that the public web event page exposes: published artists, guests and speakers (role, topic, photo, biography and scheduled appearance); organizer-uploaded programme PDFs; official event agenda in the event's timezone; gallery images; souvenir catalogue with live server stock, product code and visible prices; announcements and accessibility/attendance/refund policies. The event heading also matches web emphasis on mode, status, time and venue.

There is **no synthetic content and no mobile-only bypass**: only arrays provided by the event API are displayed. Invitation-only programme documents remain gated by the existing server endpoint, with their paths reconstructed from the returned event/document IDs rather than trusting an arbitrary download URL. External browser access may still require website authentication. Souvenir entries remain catalogue-only: do not label them as orderable or claim an operating checkout without a tested server workflow. Ticket purchase limits use available inventory and user-level maximums, while the server remains authoritative.

Native Ghana-cedi prices now display `₵` with thousands grouping and two decimal places. Other currencies keep their ISO code. No database/payment changes were made.

Remaining tests before claiming Android/iOS parity: physical device page inspection (large text, horizontal gallery swipe, longer biographies, PDF access, ticket quantity, paid checkout and camera/meeting flows), plus full native organizer editing and real merchandise order handling.

## Fourth increment: native Organizer Studio and basic event drafts

- The Android/iOS Account hub now opens a genuine native **Organizer Studio** instead of sending all event management to a web browser. The studio lists the user's server-authorized organization memberships, scopes `/events?mine=1&orgId=...` to the selected organization, and displays draft and published events with page-based loading and refresh.
- Owners, admins and event managers can create **unpublished DRAFT events** in the native editor using the existing `POST /events` endpoint. Draft metadata includes title, summary, description, category, format, country, city, start/end time and visibility. Validation rejects invalid calendar dates and end times preceding start times. Times are clearly labelled as the device's timezone and converted to UTC instants before submission.
- Those same roles can edit basic event metadata via the existing permission-checked `PATCH /events/{id}` endpoint. The native editor intentionally omits publication status, existing event visibility, date changes, payout data and ticket workflows from the PATCH payload. The server remains authoritative about accepted membership, subscription quotas, and editing permission.
- Users without an organization can continue via the existing secure website organizer registration. Advanced lineup, schedule, ticketing, publication, verification and payout tools remain in the web workspace until native workflows receive end-to-end QA. The Account portal handoff now uses the SPA's correct `/#/organizer` fragment URL.
- Add physical Android and iOS QA for safe-area scroll, keyboard dates, attendee locale differences, edit permissions, membership changes, failed network writes, draft revisit and multi-organization switching. Successful source tests do **not** imply this device QA is complete.

## QA update index fallback

Until the live web standalone artifact is deployed from the newest compatible code, the native Android QA notice now checks the official GitHub public prerelease index **alongside** the website's release endpoint. Both sources must pass strict original-repository, release-tag, asset filename, APK-size and published-date checks. If GitHub reports a newer valid prerelease than the older deployed endpoint, the device can offer it. Checks are throttled per foreground session and fail silently offline; all downloads remain user-initiated and require Android installation approval. This is a resilience measure, not a substitute for rolling out the latest tested web artifact and verifying certificate continuity on real devices.

## Native-first creator onboarding

The Discover **Host an event** and **Create your own gathering** shortcuts now route into native screens. Signed-out visitors use native sign-in, and authenticated creators open the native Organizer Studio. If no organization exists, a new `CreateOrganizerScreen` creates an organizer profile natively through the existing `POST /api/v1/orgs`, using the same six types as the server (Personal, Church, School, Business, Ministry, Association), type-specific public details, public contacts, and pending-verification status. Its validation only sends type-appropriate public data; uploaded registration/identity documents, KYC review, and payout verification continue in the existing secure workflow. A new native role/organization membership is re-read after successful creation.

We treat ordinary navigation to the browser as temporary parity debt, not the product destination. Secure provider checkout, specific external content or enterprise-only controls may legitimately use an external handoff; native social/event/navigation interactions should not. Physical-device verification and approval of pending organizer profile creation remain separate release gates.
