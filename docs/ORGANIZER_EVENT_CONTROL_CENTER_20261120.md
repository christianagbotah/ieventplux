# Organizer Event Control Center — iEventPlux

## Experience

- Mobile-first event operations header with honest total, loaded draft/postponed
  and live status counts. Counts are explicitly for loaded pages when more
  events exist; no invented analytics.
- Fast search by event name, city, category or status; one-row horizontally
  scrollable status filter chips and clear-filter control.
- List sorts upcoming events first, then historical events; client search
  does not pretend to search unloaded server-side pages.
- Each event has a cover, correct status/visibility, local date, available
  ticket and check-in counts, with public View/Preview and sharing controls.
- 'Attendees' routes to the existing organizer attendees section; does not
  claim event-specific filtering until implemented.
- Only share genuinely PUBLIC PUBLISHED/LIVE events; private/invite-only
  and draft links are never offered as publicly shareable.
- All publication status changes are confirmed in an accessible dialog,
  with cancellation/postponement reason and an explicit reminder that refund
  handling and attendee communications require additional action.
- Owner/admin-only postpone/cancel rules reflect the backend. Event managers
  can publish but cannot cancel or postpone through this UI.
- Failed event queries show a proper retryable error instead of an inaccurate
  'No events yet' empty state. Parallel statistics reduce sequential waiting.
- Real pagination loads 24 events at a time. No schema, payments or provider
  configuration changed.

## Safety and checks

- Server remains authoritative for tenant boundaries, transitions, ticket
  issuance, refunds, payments, and attendee data.
- Bun pure-logic regression cases cover filters, counts, stale status,
  public sharing, owner/admin/event-manager permissions and status warnings.
- GitHub web/mobile/production-build CI and isolated VPS/browser acceptance
  required before merge and production replacement.
