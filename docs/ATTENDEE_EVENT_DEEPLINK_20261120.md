# iEventPlux — Event-specific attendee management and scanner safety

## Organizer workflow

- The **Attendees** action on an event card navigates directly to that event's
  attendee list (`#/organizer?tab=attendees&eventId=...`).
- A URL-selected event is resolved only from the authenticated organizer's
  accepted-membership event list. If not in the first 50 results, the UI uses
  the tenant-scoped `mine=1&orgId=&eventId=` lookup. Unrecognized IDs fall back
  to a clearly signposted available event; no foreign event detail is leaked.
- Changing selected events updates the current URL without remounting the
  workspace. This matters because pending offline scans are currently stored
  only in memory for the tab; a remount would otherwise discard those scans.
- Errors loading organizer events, attendees or admission stats are shown with
  retry controls, rather than quietly displaying an empty attendee list.

## Admission safety

- Scanner stops when the event changes; camera tracks are cleaned up even if
  asynchronous permission resolves after the camera panel was dismissed.
- Late QR frame detection and stale attendee-stat responses are ignored after
  event switching; the camera cannot silently continue scanning under an old
  event context.
- Duplicate-scan throttle now includes the selected event ID.
- Offline scans retain their original event identity and require a deliberate
  sync for that event. No change to server-side admission, online verification,
  conflict handling or persistent offline storage is claimed.

## Verification

- Pure selection policy tests: authorized preference, out-of-page lookup,
  unrelated response rejection, empty state, identifier validation.
- Existing seeded organizer event security smoke extended to check that
  targeted lookup returns only authorized records, blocks unauthorized users,
  rejects malformed IDs, and preserves private organizer draft access.
- CI web/mobile/production build and isolated VPS candidate smoke and viewport
  review required. No schema migration, payment provider change or real-money
  request in this release.
