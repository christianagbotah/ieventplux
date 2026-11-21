# iEventPlux — Global consumer UX quality bar

Owner expectation: iEventPlux must deliver a premium experience on mobile,
tablet, desktop and accessible assistive technologies. A visually animated page
without reliable navigation, truthful event data or frictionless actions does
not meet this bar.

## Release 1: native discovery interactions (this PR)

- **Native browser links** for brand navigation, desktop/mobile navigation,
  featured event spotlight, compact event rows, event cards and sponsored
  events. Real hash links preserve existing SPA routes while enabling
  open-in-new-tab, copy-link, long-press and native keyboard activation.
  Separate footer actions on cards remain independently operable.
- **Real editorial media on mobile:** the first rotating highlight presents
  its genuine featured event poster as a compact visual card, not a 44-pixel
  thumbnail. Title, organizer, status and ticket price use event API data.
- **Mobile ergonomics:** primary nav remains usable above iOS home indicators
  and Android gesture/navigation bars. Main content reserves corresponding
  bottom space. Discovery quick actions and hero controls have minimum
  44 CSS-pixel touch targets; header icons do not shrink below that size.
- **Respect user intent:** manually selecting a homepage highlight pauses
  autoplay. The existing explicit play/pause control can resume rotation;
  reduced-motion preferences still disable animated rotation and ticker.
- **Semantic orientation:** current navigation page uses `aria-current=page`,
  highlight selectors use `aria-pressed`, focus is visible, and a
  keyboard-first skip-to-content action remains available.
- **Truth over decoration:** no fabricated events, ratings, ticket prices,
  live-status claims or payment availability; existing API data remains
  authoritative. Sponsored cards keep their clearly identified label.

## Acceptance gates for a production-quality release

The following are **required manual acceptance checks**, not claims that
they have been completed by this PR:

1. Mobile widths: 320, 360, 375, 390, 430 CSS pixels; tablet 768/1024;
   desktop 1280/1440/1920. Verify no horizontal overflow, no obscured
   bottom navigation/action buttons and usable text at 200% zoom.
2. Mobile Safari and Chromium: long-press events and nav, open links in new
   tabs, browser back/forward, copy and share event links, deep-link refresh,
   safe-area/home-indicator behavior, virtual keyboard overlap.
3. Keyboard-only: Tab/Shift+Tab, Enter, focused link highlighting, skip
   content, form labels/errors, menus and sheet focus trapping.
4. Screen-reader: VoiceOver and TalkBack announcements of primary
   navigation, event links, slide controls, filters, ticket pricing and
   real-time statuses. Target WCAG 2.2 AA contrast and target sizes.
5. Motion: `prefers-reduced-motion`, pause/restart behavior, no
   flashing; avoid auto-announcing every rotating slide.
6. Data states: real live/upcoming/empty events, slow/offline/retry, large
   titles, long organizer names, translated text, mixed currencies, sold out,
   and event media that fails to load.
7. Payments/meetings: verify actual ticket/merchandise purchase state and
   permissions independently from visual buttons. Do not activate real
   collection, refunds, invitation access or meeting membership without
   existing authorization and security gates.
8. Measure Core Web Vitals in a real browser: aim for LCP <=2.5s,
   CLS <=0.1 and INP <=200ms at the 75th percentile. Profile image sizes,
   font loading, lazy media and long client bundles; never manufacture
   performance claims.

## Delivery approach

Develop in isolated Git branches with per-component tests and PR CI. CI
builds belong on GitHub, not the 90%+ used production VPS. This UX change
is code review only: **do not switch active web, worker, realtime, payment
or database services as part of a cosmetic release**.

### Next UX workstreams

- Apply semantic linking and large touch targets to all authenticated
  ticket/organizer, feed, reel and search views.
- Audit event detail purchase/RSVP hierarchy, consent copy, attendee
  checkout errors, QR admission and merchandise pickup journeys end-to-end.
- Introduce a measured responsive QA baseline with real-browser snapshots
  and accessibility assertions in CI, then improve high-traffic pages.
- Add localization and international date/currency presentation checks
  without changing transaction currency or amount.
