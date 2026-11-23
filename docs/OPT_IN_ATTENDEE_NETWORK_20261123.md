# iEventPlux — voluntary attendee networking

This release adds a privacy-first directory attached to each event.
Attendees with valid tickets, accepted organizer roles, or APPROVED RSVP for
a free event may independently opt in to show a display name and profile image
to other attendees who have ALSO opted in and still meet the same access rules.
An event marked Going, a saved event or a paid-event RSVP without a valid
ticket is NOT sufficient for access.

No attendee list is published by default; opening or buying a ticket never opts
the user in. Consent is stored using existing EventInterest(kind=NETWORK),
and participants can leave with a single explicitly confirmed action.
Directory queries return zero identities to users who have not opted in.
Private/invite-only IDs return not found to unentitled viewers, blocked
profiles are excluded in either direction, and every returned attendee is
rechecked for valid ticket/RSVP/staff entitlement so refunded/revoked users
disappear. Nonpublic data like phone, email, ticket details and personal bio
is never selected. Only name, avatar, follower state and identity are shown.

The list uses bounded cursor paging and request rate limits; follows use the
existing social safety/blocks and do not send direct messages. The own
Saved/Interested/Going page excludes the new NETWORK interest kind.

Implementation is backwards compatible, contains no schema migration and
no new paid provider. Privacy, public/paid/free and consent policy tests run
in CI. Real two-account participation, refund revocation and moderation
behavior require user acceptance testing before production certification.

Built-in profile report and block actions use existing social moderation
services; they do not disclose contact details. Consent can be revoked even if
the event is cancelled or a ticket was refunded.

Future phases: mutually accepted connection requests, age-specific protections
and carefully consented DMs.

Paid-event attendance gating applies even if a paid ticket type was later deactivated.
