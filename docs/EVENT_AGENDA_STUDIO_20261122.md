# iEventPlux — Full Event Agenda Studio

Builds on the already deployed Programme Studio. All work targets the user's one existing testing hostname: https://ieventplux.lightworldtech.com/.

## Organizer experience
- Structured, collapsible Detailed agenda & time slots panel in the event editor.
- Add/edit programme slots with title, speaker or performer, description, scheduled start and optional finish, plus numeric display order. Existing items appear as numbered cards. Equal sort orders sort by start time.
- Inline validation, busy feedback, named confirmation for removing a session, and no automatic production-record writes during preview.
- Organizer enters times in the event's configured IANA timezone. The client converts to UTC for storage and converts existing UTC instants back to event local time. DST skipped and repeated hours are rejected rather than guessed.
- Server create, update and delete require event:edit permission and event-ID-scoped queries. Authoritative agenda validation checks title, ISO UTC timestamps, finish after start and bounded display order.
- Draft, private and invite-only agenda reads use the programme visibility guard; no database migration or event reset.

## Attendee experience
- Full event agenda numbered timeline on public event pages with accessible time markup.
- Event IANA timezone and full dates avoid silent visitor-local ambiguity, especially for programmes crossing midnight.
- Speaker and description are shown if supplied by the organizer. No generated people, sessions or descriptions.

## QA and safety
- Tests for server policy and event timezone conversion: Africa/Accra, Asia/Kolkata, America/New_York, DST gaps/repeated local times, invalid calendar dates, backwards session duration.
- GitHub web, mobile, production build, isolated Next.js preview, anonymous unauthorized-write checks, browser viewport QA using synthetic browser-only event data, and post-cutover service health.
- Authenticated organizer CRUD with disposable organizer-owned records requires separate UAT; do not claim it was exercised.
- Paid tickets, RSVP, checkout, merchandise fulfillment and no-fixed-software-cap media meetings are unchanged.
- Deploy a reversible web-only systemd override on existing domain. Retain the former web release; leave realtime, SFU, TURN and worker untouched.
