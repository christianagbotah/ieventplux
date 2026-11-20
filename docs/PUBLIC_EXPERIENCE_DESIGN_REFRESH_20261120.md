# iEventPlux public experience — editorial & mobile redesign

**Context:** Live mobile/desktop screenshots reviewed on 2026-11-20.
This is an end-user experience release for the global event/social platform;
it does not change payment integrations, user-generated content moderation,
database schema, or admin workspace scrolling.

## Design and user experience changes

- **First-screen promise:** a short editorial message, primary Explore CTA,
  Live shortcut, Host CTA, fast Today/Weekend/Free/Online filters.
- **True featured-media spotlight:** the desktop hero uses a real featured/
  upcoming event with its poster, date, organization and ticket pricing.
  If no real event exists, show a labelled-neutral copy fallback, not an
  invented concert or fake activity.
- **Mobile-first hero:** shorter copy, smaller padding, an actual featured
  preview row instead of large desktop cover art, single-row scrollable
  shortcuts with 44px+ controls where primary actions matter.
- **Discovery before AI and sponsored placements:** actual upcoming public
  events and followed creators precede clearly labelled sponsored posts and
  the optional AI search panel. The hero spotlight is not duplicated in a
  separate featured-events rail.
- **Cleaner navigation:** five equally spaced mobile bottom tabs instead of
  six; a mobile Live icon remains in the header. Desktop primary navigation
  and global account actions remain available. The duplicate desktop header
  search is hidden only on discovery/search screens with their own main search.
- **Search clarity:** active filters are removable as individual chips; clear
  search updates the hash route. The filter drawer scrolls on small/short
  screens, maintaining access to reset and all search controls.
- **Voice concierge:** the floating action appears only when the visitor has
  signed in; guest users are never pushed into a sign-in-gated popup. On a
  signed-in phone the floating action is reduced to 44px, stays above the
  five-item tab bar, and hides when form inputs are focused.
- **Trustworthy marketing:** organizer CTA no longer promises a specific
  percentage or implies worldwide payment/stream providers are active.
- **Accessibility and performance:** semantic link-button interactions,
  focus-visible rings, reduced-motion media handling, true image descriptions,
  native keyboard form search, compact home and lower page weight.

## Verification

- Bun SSR unit tests render the feature component with a real event and
  absent-image/free-event fallback; check truthful currency display.
- Repo lint, typecheck, mobile tests, production standalone build and
  read-only smoke must pass CI before production.
- Candidate screenshots at approx. 390x844 and 1440x900 tested using local
  Chromium against the isolated production build. A follow-up mobile
  device/UAT check remains recommended; screenshots cannot prove touch,
  accessibility reader or payment behavior.
- Existing user data, payments, KYC, access control and provider credentials
  must remain untouched. Preserve old production build for rollback.
