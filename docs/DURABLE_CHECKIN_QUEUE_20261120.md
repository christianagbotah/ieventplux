# iEventPlux — durable pending check-in, 20 November 2026

## Safety and scope

- Pending scans use IndexedDB within this browser origin and are partitioned by signed-in staff member and organization.
- Each record contains only event ID, original scan ID, timestamp, and scanned ticket/QR code. It does not cache buyer email, financial data, or complete attendee rosters.
- Locally stored scans are **pending**, never admitted. The server must validate via POST /checkin/sync before an admission is confirmed.
- Network errors from the browser API are status-zero NETWORK_ERROR objects. Previously the policy rejected these, making offline queuing unreachable. The new policy accepts only connectivity failures; HTTP rejections and cancelled requests are never queued as admissions.
- Client scan IDs use crypto.randomUUID and remain stable across storage/replay. The server checks for prior matching IDs to prevent multiple admission records from a replay.
- Only server-acknowledged results are removed from IndexedDB, after checking response shape and completion of the local delete transaction. Ambiguous or partial responses remain pending for safe retry.
- Events are synchronized individually, using their original event ID. A browser reload restores the pending queue for the same signed-in user and organization.
- Maximum 500 pending scans per user/organization; storage failures are shown as **not saved**, not queued.

## Limitations

- Site data may be evicted or manually deleted, so operators should sync promptly. QR codes are bearer credentials, so do not use untrusted or shared devices. Browser storage is not equivalent to a secure offline admission verifier.
- This does NOT cache a signed roster, validate admission offline, or automatically issue an admission during a network outage.
- No DB migration, payment change, new provider subscription, or real-money transaction is part of this release.

## Required verification

- Bun policy tests, actual IndexedDB reload/recovery browser test, GitHub web/mobile/build CI, isolated VPS production build and read-only production smoke before release.
