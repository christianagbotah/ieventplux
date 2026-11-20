# iEventPlux — Event-detail and attendee checkout experience

## Audience experience

- Booking/ticket availability appears before lengthy event contents on small
  screens; on desktop it occupies the right-side sticky booking column.
- The ticket card uses legible, ordinary light/dark theme surfaces instead of
  neon/glassmorphism and shows a clear in-person, hybrid, or virtual label.
- An accessible compact mobile registration bar stays above the tab navigation
  and disappears when the ticket selector is open.
- The ticket selector retains mobile-friendly 44px quantity controls with the
  correct original ticket currency. It displays an indicative subtotal; the
  backend recomputes total, fees, discounts and inventory atomically.
- Free tickets remain accessible worldwide. GHS-only paid checkout is
  explicit: USD/EUR etc are visible in their currency but cannot be added
  to checkout without a certified currency/payment adapter.
- Closed, cancelled, ended and postponed events cannot advertise active
  checkout. Invitation-only events still require approved invitations before
  checkout.
- Follow / Unfollow toggles the correct endpoint, shows progress/error, and
  updates follow statistics optimistically only after successful API response.
- Event hero typography is quieter, and event summary remains readable to
  reduced-motion users; venue unknown is no longer mislabelled as a broadcast.
- Public social metadata has worldwide positioning but does not claim
  worldwide payments, participant counts, or provider availability.
- No payment provider configuration, KYC, moderation schema or currency
  settlement behavior changes in this release.

## Technical constraints and verification

- The ticket-selection policy models maximum quantity, seat capacity,
  group discount and GHS-only paid currency. Unit tests include free
  international tickets, foreign paid currency, invalid quantities,
  capacity reservations, mixed tickets and display consistency.
- The server remains authoritative on real ticket reservation, payment
  initiation, identity, invitation access and current inventory. UI gates
  are safeguards and clearer UX, not the security boundary.
- Run web/mobile CI, standalone production build and read-only production
  smoke before releasing. Check event detail on 390px and desktop in the
  isolated build. Do not use real-money transactions for design testing.
- Rolling back the UI can use the preserved .next deployment artifact.
