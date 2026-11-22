# Event creation and ticket checkout — enterprise UX iteration

Scope: existing iEventPlux testing website `https://ieventplux.lightworldtech.com/`. This revision contains **only frontend UX and client-side validation**; it does not introduce new payments, migrations, seeded events, subscription providers or change any LiveKit meeting limits.

## Organizer event editor
- Wider responsive editing dialog with compact, persistent title/description header and sticky save/cancel footer. Grid uses stacked fields on small phones, two columns on tablets/desktop.
- Deliberate creation hierarchy: (01) event essentials, (02) location and schedule, (03) artwork and policies, (04) ticket types and admission once the first draft is saved.
- Explicit field labels, descriptions, accessible inline schedule errors and accurate **organizer device local time** guidance (previous hard-coded Africa/Accra label was wrong for a worldwide audience).
- `validateEventDraftTiming` checks meaningful title, present parseable local start/end date times, real calendar dates and end strictly after start. It deliberately does not prohibit editing historical events; API remains authoritative for final validation.
- Poster uploader uses built-in busy/disabled button and responsive field layout; existing file upload endpoint and permissions unchanged.
- Once a newly created draft is saved, the initial form is hidden instead of remaining editable with no save button. The organizer proceeds to fully labelled free/paid ticket type setup; publishing remains a separate deliberate action in Events.
- Existing weekly series, RSVP, venue, AI copy copilot, event operations and ticket APIs are preserved.

## Guest-facing ticket checkout
- Unified premium CTA for free registration and paid ticket selection. Drawer/dialog title has plain-language security and availability details.
- Ticket types are separately carded, with current availability, per-order limit, relevant online access and group discounts. Selected cards have a subtle high-contrast accent.
- Quantity controls use a named button group with 44px-safe targets; the selected count is announced in a live output. Functional state updates and maximum clamps prevent repeated rapid taps from exceeding locally known availability. Server still decides final reservation.
- Persistent promo-code and optional phone labels replace inline Effects input shells. Promo codes are only submitted for baskets that actually contain priced ticket types, preventing a stale paid promo being sent with a free RSVP.
- Footer displays a **quoted estimated subtotal**, selected ticket count, clear free-vs-paid CTA and truthful notice that final fees/discounts and successful admission are established server-side. No client UI claims an unconfirmed payment succeeded.
- Price and currency integrity retained: checkout supports free tickets and paid Ghana cedi tickets only where backed by configured payment settlement. No unsupported USD/EUR payment promises.

## Verification
- Unit tests: the pre-existing quote policy, new mixed free/paid basket policy, datetime validation and enterprise UI foundation. Includes a regression for the Radix `Button asChild` single-element rule, which previously crashed real event detail pages on the calendar button.
- TypeScript, targeted ESLint, comprehensive CI web/mobile/production build and isolated Next.js production release.
- Real browser check at 360px / 390px / 768px / 1440px including document overflow, accessible checkout labels, keyboard focus, and booking modal behavior when public tickets are available. Never create a real order or charge funds as part of a visual QA.
- Deploy only the verified source revision to the existing public testing hostname, while retaining the prior web drop-in for rollback. Do not restart or redeploy realtime, media, payment providers, or mutate customer data.

## Future follow-ups
Full organizer event-create UAT with a legitimate test organizer, actual free RSVP with owned test ticket, simulated payment lifecycle, ticket availability race tests, checkout fee disclosure, venue time-zone selection (server-backed timezone field), and accessibility audit (screen reader and contrast).
