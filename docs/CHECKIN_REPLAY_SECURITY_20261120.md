# iEventPlux — scan replay and device session scope

## Risks and fixes

- A previous check-in response could be recovered by clientScanId alone,
  even if the authenticated caller selected another event or staff user ID.
  Older web clients generated timestamp-based IDs. This could expose an
  unrelated attendee's ticket details if a scan identifier was reused.
- The server now requires matching event, staff user and ticket credential
  (valid manual code or HMAC-verified QR) before returning a prior result.
  All mismatches return a generic HTTP 409 without attendee data.
- Legitimate offline retries continue to use their original stable scan IDs,
  event, staff user and credential after lost responses.
- Legacy mobile scan IDs with colon delimiters and a historical trailing brace remain accepted; new mobile device IDs no longer include that trailing brace.
- Identifiers and payloads are length checked; offline capture timestamps
  are verified before database writes.
- POST checkin/scan treats direct scans as ONLINE regardless of an
  arbitrary caller-supplied source field. Only checkin/sync may mark
  OFFLINE_SYNC.
- Optional device session IDs must belong to the current user/event and
  must not have been revoked. The server does not update another user's
  device session.
- Existing accepted-membership and checkin:scan permission gates remain.

## Verification

- Pure unit tests for cross-event/staff/credential mismatches, valid
  idempotent replay, malformed IDs and invalid timestamps.
- CI seeded service smoke creates a temporary AdmissionScan, verifies a
  legitimate replay, rejects other contexts and confirms no ticket changes.
  The synthetic record is removed after testing.
- No payment, real admission, schema migration or provider settings changes.
- Multi-scanner simultaneous admission races are a separate engineering
  problem and are not claimed solved by this patch alone.
