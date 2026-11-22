# iEventPlux — searchable organizer meeting catalog (22 Nov 2026)

The organizer's **Group Meetings** page now searches across eligible events with
server-side pagination rather than loading the 50 newest events and filtering
drafts in the browser. This prevents false 'no eligible events' empty states for
organizers with many events.

- API: authenticated `GET /api/v1/events?mine=1&orgId=...&meetingEligible=1&page=1&pageSize=20&q=...`.
- The server first enforces accepted organization membership, soft-deletion,
  and a fixed eligible-status list: `PUBLISHED`, `LIVE`, `ENDED`.
- Only within the explicitly opted-in organizer meeting catalog, `q` searches
  event titles case-insensitively and is limited to 120 characters.
- The response keeps the existing `items`, `total`, `page`, `pageSize`,
  `hasMore` format; Next/Previous pages and a clearable search are accessible
  on mobile and desktop.
- Fast successive searches, org changes, unmounts, or refreshes cannot let an
  older API response replace the current meeting picker.
- Other event listing views and public discovery search are unchanged.
- Pure unit tests cover status gating, search trimming/length and preserving
  the original organizer listing semantics. CI runs the new suite.

No database migration, payment-provider change, attendance-cap change, or
reset of existing meeting records is required. A logged-in organizer should
still UAT event selection and meeting launch on a narrow phone viewport.
