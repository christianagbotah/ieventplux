# iEventPlux — Admission Operations, near-live dashboard

## Organizer UX

- Under Attendees & Check-in, one event-scoped control center displays total
  issued tickets, admitted tickets, valid tickets still eligible to enter, and
  all-time logged admission anomalies. The progress meter uses admitted / issued,
  not a fabricated attendee count.
- For the previous 15 minutes it shows counts of logged admissions, duplicate,
  conflict, and invalid attempts. It separately lists recent logged issues
  (up to 8) and scanning staff activity (up to 8 scanners).
- Registered device sessions (up to 12) have last sync timestamps, staff
  name, registration and revocation flags. **Registration or a recent sync is
  not proof of current network presence.**
- The panel polls every 15 seconds while online and the page is visible,
  refreshes on network reconnection/visibility, event changes, successful scan,
  offline reconciliation and manual refresh. No fabricated WebSocket live feed.
- Failed reads retain the last snapshot but prominently label it possibly
  stale. Event changes abort pending requests; other event data is never
  allowed to replace the newly selected event's monitoring panel.

## Privacy and API

- GET /api/v1/checkin/monitor?eventId= is protected by authenticated accepted
  organization membership and checkin:scan permission, like check-in stats.
- The endpoint sends Cache-Control: private, no-store and includes no ticket
  ID/code, holder name/email, QR payload/secret, financial data, device token,
  token hash, or raw admission notes. Staff display names and device labels
  are visible only to authorized event check-in staff.
- The dashboard uses existing AdmissionScan, Ticket and DeviceSession data.
  New SQL tables, providers or generated event activity are not introduced.
- Only logged invalid attempts appear in alerts; rejected QR codes that never
  reached an admission record are not falsely represented as counted.
- Registered devices are not represented as online. This is a near-live
  server snapshot and does not imply true presence telemetry.

## Release verification

- Pure counters, progress and sync-status unit tests.
- CI seeded HTTP privacy test verifies authorization, response shape,
  tenant scope, no private payload fields and no-store caching.
- GitHub web/mobile/production build plus independent VPS build, candidate
  smoke and post-deployment check before release. No real admissions or
  payment simulations on production.
