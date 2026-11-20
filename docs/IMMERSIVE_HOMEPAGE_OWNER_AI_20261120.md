# Immersive iEventPlux homepage, organizer roles, and AI-disabled event guide

## Customer experience

- The global public homepage rotates three editorial stories every 6.5 seconds:
  genuine event spotlight, online-event discovery, and creator hosting.
- Event artwork and event names always come from real public events.
  Editorial/placeholder slides never invent other events.
- Mobile and desktop typography animate with short transitions.
  A ticker highlights event categories, never fake attendance counts.
- Slides have manual navigation and pause/resume controls. Hover/focus,
  hidden tabs and reduced-motion preference stop automatic progression.

## Organizer versus attendee

- Signed-in owners and accepted event-team members see a management action,
  not ticket purchase/free RSVP and follow-yourself actions.
- Event API has an authenticated isEventHost flag, organizer profile has myOrg.
  No owner ID is exposed to guests.
- The social follow API rejects an organization owner following themselves.
  Other privacy and permission checks remain server-authoritative.

## Real catalogue fallback, no false AI claim

- Production has AI_CONCIERGE_ENABLED=false and no AI provider credentials.
  This release does not activate model services or simulate voice replies.
- The status endpoint reports configured capability without revealing secrets.
  Disabled voice/chat controls do not open broken prompts.
- The event finder accepts natural-language keywords and extracts actual
  known cities/categories plus free/paid, dates and format.
  It queries public events and labels its source CATALOGUE, not AI.
- Actual AI requires validated model-provider credentials and safe operations.

## Verification

- Pure parser tests plus development-only HTTP smoke test for status and
  catalogue fallback; owner detection and self-follow rejection in existing
  Following smoke. GitHub web/mobile/build checks and staged browser review
  required. No production database migration, provider key changes or real
  payment simulations.
