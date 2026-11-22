# iEventPlux — Scanner session management (20 November 2026)

## Organizer controls

Under Organizer → Attendees & Check-in → Admission Operations → Registered Devices, organizers can manage scanner sessions for each event.

- Event owners, admins and event managers may rename or revoke any scanner session belonging to that event.
- Check-in staff may rename or revoke only their own sessions.
- Register this browser with a recognizable label (2–80 characters); subsequent online scans and offline syncs include that device-session ID.
- A confirmation dialog precedes revocation. Revoked sessions are retained, along with their historical admission records.
- Every successful rename or revocation writes an AuditLog entry in the same transaction as the session change.

## Privacy and security

Operations require authenticated accepted organization membership and checkin:scan permission. Device changes additionally require ownership of the session or event:edit permission. Device lists omit token hashes and raw credentials.

Only a nonsecret session ID is stored in browser localStorage, separately scoped to each user, organization and event. The raw device token is not saved. The server verifies session ownership, event match and nonrevocation before it accepts registered scans or syncs.

**Important:** Revoking a device-session ID does not revoke the staff user's sign-in or organization membership. Older clients may still submit scans without a device-session ID for backward compatibility. To remove all scanning rights, separately remove that staff user's event access.

Registration and a recent successful sync are not proof of live device presence. Offline scans remain pending until the server verifies and reconciles them.

## Release acceptance

- Pure tests: scanner role and ownership, safe label validation, browser key scoping across users, organizations and events.
- Seeded integration: synthetic scanner registration, rename, cross-tenant and unauthorized denial, secret-free inventory, revocation, scan/sync denial and audit records.
- GitHub CI: web, mobile, production-build; independent VPS candidate build, read-only smoke, and rollback verification.
- No database schema migration, real ticket admission, payment transaction or paid provider change.
