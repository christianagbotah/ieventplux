# Privacy-aware Event Communities

Introduces a thread-based discussion hub per event, reusing the existing
Comment records and social safety controls instead of a new message store.

Visitors and attendees can explicitly publish introductions, questions or
tips, reply to visible root threads, and view the conversation in a mobile
layout. The board uses 12-item root pagination, at most 40 earliest replies
per root and clear limits for truncated replies. It is distinct from
meeting-only, ticket-protected LiveKit chat.

The API now enforces shared visibility and access checks before returning
comments, individual comment details and writes. Invite-only events require
accepted event organizer membership, approved RSVP or a valid ticket. Removed
or suspended organizations are inaccessible, and cancelled events are read-only.
Replies are confined to a visible root in the same event, with two-way block
checks. Organizer and author deletion is subject to access rules and uses a
professional confirmation modal. Existing rate limits, text sanitization and
organizer AI-moderation triage remain intact.

No schema migration, new provider, recurring cost, or live attendee records
are required. This release is not direct messaging or attendee matchmaking.
Mobile, private-invite and two-account moderation UAT remain before production
certification.
