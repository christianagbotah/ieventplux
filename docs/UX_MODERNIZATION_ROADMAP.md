# iEventPlux — Product Modernization & Release Roadmap

**Owner:** Lightworld Technologies Ltd.  
**Baseline:** Round 35 merged, `main` at `cf633526` when Round 36 began.  
**Round 36 work:** [PR #2](https://github.com/christianagbotah/ieventplux/pull/2).  
**Important:** Code-level CI checks are NOT visual browser sign-off, native hardware validation, payment-provider verification, or live-deployment approval.

## Design direction

A consistent, premium events marketplace for Ghana with polished discovery, ticketing, live experiences, and serious enterprise tools for event organizers and platform staff.

- **Visual language:** dark evergreen / vibrant green / restrained gold; strong editorial type hierarchy, subtle glass surfaces, controlled gradients and shadows; rounded but not bloated cards.
- **Responsive:** at least 320, 360, 390, 428, 768, 1024, 1280, and 1440px; no horizontal document overflow, clipped headings, hidden CTAs, or inaccessible sticky controls.
- **Practical usability:** clear mobile bottom navigation, readable forms, 44px+ touch targets, predictable state transitions, accessible search/filter/results, obvious error recovery, keyboard navigation, and reduced-motion behavior.
- **Trust:** distinguish payment configured vs verified, simulated vs real, order pending vs paid, stream synthetic vs provider-delivered, and notification accepted vs actually delivered.
- **Data integrity:** date/time in event IANA timezone, UI money in Ghana cedi (₵) with two decimals, amounts stored in integer pesewas; no client-supplied financial authority.
- **Performance:** progressive image loading, event and view skeletons, cancellable requests, bounded pagination, sensible rerender/real-time subscription lifetimes.

## View-by-view status and acceptance checklist

| Surface | Round 36 changes (implemented in PR #2) | Further acceptance work |
|---|---|---|
| Global shell and navigation | Five clear mobile tabs; mobile search entry; skip-content keyboard fix; persistent view state; modern responsive token system | Browser UAT across breakpoints and assistive tech; notification and unread assertions |
| Discover & search | Append-on-pagination (no losing earlier cards), cancellation of stale searches, retryable empty/error states, keyboard-operable promoted cards | Search now queries server full catalogue (first page, 36 results) with offline fallback; next: additional pages, sorting, map/distance filters, search telemetry and reliable no-results analytics |
| Event card and details | Keyboard event cards, Round 38 ticket picker with better mobile scrolling/quantity actions, server-calculated-fee disclosure and private venue/broadcast redaction | Visual fee/checkout UAT, sharing/calendar/venue, long names and modal keyboard audit |
| Checkout / order | Separate event and calendar actions in order confirmation (no nested button/link) | Real Hubtel provider test; checkout return errors, retries, refunds and reconciliation; explicit in-progress verification states |
| Sign in / recovery | Web and mobile eye toggles, responsive card styling, web accessible reset Dialog, native password-reset flow; demo one-click sign-in hidden on production | Real SMTP reset email, password-manager and accessibility audit, mobile session persistence on hardware |
| Live / broadcasts | Safe authorized Socket.IO room join; production-safe client path; refreshable live listings with accurate fetch-error states | Real stream ingest/playback, entitlement access on browsers/devices, viewer caps and moderation load test |
| Reels, social, reviews | Retained existing functional implementations and common shell/token upgrades | Gesture, auto-play, keyboard/video captions, permission and performance UAT |
| Organizer workspace | Accessible drawer/active-org summary; Round 38 adds responsive, searchable Orders and Attendees with safer QR scanning | Event editor, protected durable offline scan queue, finance/studio/reports, role journeys and responsive UAT |
| Platform admin | Mobile section selector and truthful provider badge; Round 38 Event oversight adds mobile cards, search/filter and reason-required suspension confirmation | Audit remaining admin finance/refund/payout panels, table responsiveness, permissions, irreversible action confirmations |
| Native mobile | Evergreen theme, neutral nav, redesigned Discover hero/featured/categories/search, password visibility and reset flow | Physical Android/iOS passes, offline ticket wallet/check-in sync, deep-link/back stack, Play/App Store compliance |
| Realtime & service gateway | Session-bound notification rooms, playback/pass checking, public/private event access, origin checks, startup secret guards, allowlisted preview ports | Multi-user adversarial browser/WebSocket load testing and proxy deployment rehearsal |
| Operational launch | Round 35 production build+read-only smoke retained; CI now tests realtime auth | Real providers, stage/prod URL, migration baseline, real admin bootstrap, physical mobile, scratch restore, security/load audits |

### Current Round 36 automated evidence

The web CI pipeline has lint, Next TypeScript, a PostgreSQL-backed development stack, golden-path checkout smoke, a real Socket.IO integration-smoke for room authorization, and ops checks. The mobile pipeline runs pure logic tests and TypeScript. The isolated production-build pipeline builds/boots Next standalone and verifies read-only health/safe provider modes. Always check **Actions for PR #2's exact last commit**; older green commits are not evidence for newer changes.

### End-user acceptance journeys (manual + automated, each role)

1. **Anonymous attendee:** Discover → search/filter → select public event → view prices and details → register/sign in → secure checkout/RSVP → order pending/paid → ticket wallet QR → venue check-in (duplicate rejection).
2. **Ticket holder:** watch public/free stream; view paid livestream only with valid entitlement; preserve/revoke token handling; replay once ready; never receive someone else's private notification.
3. **Organizer:** create and verify organization → draft/publish event → manage inventory, payments, invitations, staff check-in → message attendees with consent → request payout and reconcile ledger.
4. **Platform staff:** moderation/support/finance/administrator permissions → review provider verification, refunds, payouts, incident Ops, logs, security events.
5. **Offline/unstable connection:** mobile ticket saved once stays visible; offline check-in does not lose or double-apply scans; reconnect shows conflicts and the authoritative server result.

## Prioritized next execution backlog

### P0 — Cannot launch live money or sensitive data

- [ ] Review PR #2 security changes and verify real browser/session WebSocket restrictions.
- [ ] Real Hubtel Checkout status and callback contract (verified provider query with non-null matching amount), Send Money, SMS, SMTP, and Cloudflare Stream; record evidence and incident/rollback notes.
- [ ] Deploy secure staging with PostgreSQL and exclusive app/worker/realtime ports; rehearsal of restricted Caddy proxy, HTTPS, backups and scratch restores.
- [ ] Staging bootstrap of first administrator with unique non-demo password; tenant and privilege penetration tests.
- [ ] Production-state regression: unavailable providers never masquerade as live/simulated successful charges, payouts or messages.

### P1 — Cross-view design and product parity

- [ ] Full manual view-by-view screenshot/a11y UAT matrix at above breakpoints; repair every overflow, nested interactive target, blocked modal, sticky header or offscreen menu.
- [ ] Organizer Events, Orders, Attendees, Streaming, Promotions, Finance and Billing UI: one-row filters where possible, mobile card alternatives for wide tables, visible action buttons, error/empty/loading states.
- [ ] Admin 14 sections: mobile controls, search/filter/sort, bulk actions only with permission, keyboard and confirmation coverage.
- [ ] Event detail and ticket picker: clear CTA, price/fees summary, date/time/venue, stock/waitlist, accessibility and buyer error recovery.
- [ ] Native Android/iOS device build and physical check-in/QR/network handoff checks; mobile search now queries up to 36 published events per request with a cached-home fallback, and needs explicit pagination/large catalogue performance QA.

### P2 — Polish, growth and scale

- [ ] Discovery search precision and ranking, sharing/link previews, city/category/date exploration, publisher profiles, SEO-aware public event URLs.
- [ ] Mobile bottom-tab navigator design, offline-first persistence, native camera/broadcast delivery and push notification permissions.
- [ ] Reels video accessibility, low-bandwidth performance, thumbnails and content moderation.
- [ ] Load-test payment concurrency, 1,000+ simultaneous stream presence rooms, worker retries, event inventory and database pool.
- [ ] Analytics telemetry, CLS/LCP budgets, screenshot regression CI, accessibility scans and privacy/data retention disclosures.

## Release policy

- Never deploy unreviewed or failing commits.
- Never execute the mutating development smoke script or demo seed against production.
- Never infer external provider verification from credentials, green CI, a simulator or an HTTP health-check response.
- Production use requires the sign-offs in [GO_LIVE.md](GO_LIVE.md). Web-first may launch without mobile app stores **only** when all relevant web and provider gates are passed.
- No production domain, secrets, provider funds or live customers were accessed during the Round 36 GitHub code review.

---

*This is a tracked engineering plan, not a claim that all views were manually accepted. Add proof links as each acceptance check is completed.*

### Round 38 implementation notes

- **Tenant security:** organizer event listings are now server-scoped to accepted memberships, including no-`orgId` listing; event detail no longer leaks internal broadcast metadata or private invite-only addresses. Automated adversarial seed scenarios added.
- **Scanner limitation:** offline admission attempts are queued in the current browser tab only and are **not durable after refresh**. Until an encrypted persistent offline queue and offline roster verification are built and tested, staff must keep the tab open and reconcile before leaving the venue.
- **Acceptance remains:** mobile cards and ticket picker have code updates but require real browser/device screenshots and keyboard/assistive-tech tests.
