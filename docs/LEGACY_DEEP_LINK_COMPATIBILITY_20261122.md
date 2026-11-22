# iEventPlux — direct-link compatibility

The portal intentionally uses a hash router (`/#/organizer?tab=meetings`,
`/#/event/:slug`, `/#/meeting/:id`). Valid existing RSVP, invite and
meeting links already use this format and continue to work unchanged.

Users sometimes paste shorter paths such as `/organizer?tab=meetings` or
`/meeting/:id`. These previously returned HTTP 404 because Next.js only served
the portal at the root. A whitelist-only Next.js catch-all route now performs a
temporary redirect from known clean paths to their existing hash-router
equivalents, preserving bounded query parameters.

The redirect is same-origin only, never replaces the API or upload routes,
rejects unknown paths, and makes no admission or authentication decision.
The existing client API permission and meeting ticket/RSVP rules remain
authoritative. Unit tests cover known links, query preservation, unknown paths
and path injection. Deep-link smoke should check 307/308 + Location and then
the destination homepage with the intended browser hash.

No database schema changes or provider credentials are involved.
