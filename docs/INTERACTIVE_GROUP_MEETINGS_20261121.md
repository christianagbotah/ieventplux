# iEventPlux — Interactive event meetings (2026-11-21)

**Status:** implemented as a **draft, disabled-by-default small-group pilot**, not a
production-ready or globally scaled meeting service. No audio/video recording,
automatic transcript, AI interpretation or webinars at arbitrary scale are claimed.

## What is real in the feature branch

- Each published, noncancelled event of an active organization may have one
  independently managed meeting. Accepted organizer owner/admin/event-manager
  roles configure 2–6 participant capacity, chat and screen-sharing policy.
- Organizer Studio > Group Meetings and the event page expose create/start/join;
  the dedicated `#/meeting/{meetingId}` view offers host and attendee workflows.
- Meeting host starts and ends the room explicitly. Ending notifies and expels
  joined peers through the authenticated realtime relay.
- Attendees must sign in and hold an approved RSVP or actual valid event ticket.
  A public event page by itself never grants live meeting media access. Socket.IO
  admission repeats the entitlement check independently of the API.
- WebRTC carries **actual** microphone, camera and optional user-initiated
  screen-share video between participants. It is not the synthetic broadcast
  player. Audio-only participants still have remote audio playback.
- Participants can join/leave, mute/unmute, toggle camera, share/stop sharing
  their screen where supported, see a peer roster and copy the room link.
  Screen-share capture automatically stops on browser sharing-end and leaving.
- Chat is persisted in `MeetingMessage` and relayed only after a successful
  authenticated API write; organizers can hide messages and see moderated rows.
- Host can remove a participant. A durable `MeetingBan` row blocks all
  reconnects until an organizer explicitly restores access. Trusted server
  eviction closes current socket connections immediately. Audit records apply
  to creation/start/end/participant removals/restoration and chat moderation.
- Socket signaling is ephemeral, target-bound to a peer in the same meeting
  room, size- and rate-limited, and rechecks session/meeting authorization.
  No SDP/ICE is persisted, and no recorded camera or screen media is stored.

## Architecture and operational limits

- Browser-based **peer-to-peer mesh** WebRTC is viable only for very small rooms,
  capped at six simultaneous sockets. It is NOT an SFU, large webinar or video
  conferencing service at Facebook/TikTok scale.
- Connection establishment uses a configurable STUN server, with optional
  short-lived TURN credentials derived server-side using coturn REST HMAC.
  **Without working TURN, some mobile and corporate NATs cannot connect.**
  TURN (and HTTPS) is required to claim reliable cross-network group calling.
- Screen sharing depends on browser permission/support: desktop Chrome/Edge/
  Firefox commonly support it; many mobile browsers may not. The UI must show
  an unavailable message, never claim sharing success on a rejected prompt.
- No participant admission waiting room, breakout rooms, calendar recurrence
  import, large-scale SFU mixing, multi-region failover, meeting recordings,
  end-to-end encrypted group key verification or native Android/iOS screen
  capture support has been verified in this iteration.
- Existing live broadcast/chat and ticket commerce are separate systems;
  meeting access does not purchase or issue a ticket.

## Safe staging enablement

1. Preserve a verified PostgreSQL logical backup and test restore. Review the
   *additive* SQL in `scripts/migrations/20261121_event_meetings_additive.sql`.
   Never use `prisma db push --accept-data-loss` on production.
2. Deploy matching web app and realtime service versions together.
3. Set `IEVENTPLUX_GROUP_MEETINGS_ENABLED=true` **in both** the web and
   realtime service runtime only in authorized staging.
4. Configure the appropriate `APP_URL`, secure session cookies, a strong
   `REALTIME_SECRET`, and working `/socket.io` websocket reverse proxy.
5. Operate coturn with `use-auth-secret`, matching
   `MEETING_TURN_SHARED_SECRET`, publicly resolvable `MEETING_TURN_URLS`,
   TLS where possible and tested relay UDP/TCP connectivity. Rotate private
   secrets and keep the shared secret out of the browser bundle.
6. Perform cross-network two-device WebRTC tests, actual camera/mic
   permissions, iPhone/Android joining, supported desktop screen-share,
   audio-only mode, abrupt disconnect/reconnect, stop sharing, chat history,
   session expiry, ticket expiry, host end, host removal, restored access,
   duplicate simultaneous room joins and capacity enforcement.
7. Test denied/forged room names, guessed IDs, cross-org organizer IDs, draft
   and invite-only event visibility, concurrent membership/ban changes,
   malformed signaling payloads and moderation cases on isolated staging.
8. Only after security review, load tests, operator readiness, observability and
   backup verification should an authorized release be considered.

## Scaling roadmap

For tens/hundreds/thousands of concurrent participants, replace mesh with a
production SFU (e.g., self-hosted LiveKit/mediasoup with regional nodes and
TURN). Keep ticket/RSVP authorization, host moderation, durable text chat and
safe media lifecycle in iEventPlux's own services. Use role-based presenters,
region-aware video ingress, performance/cost budgets, captions, disability
access, data retention and abuse reports before mass launch.

## Verifiable results (do not invent)

CI should verify Prisma type generation, unit tests for room policy and
signaling, web/real-time build and independent migration on isolated Postgres.
Real browser cross-network UAT is separate: passing TypeScript or unit tests is
**not** evidence that camera, microphone, screen sharing or TURN connectivity
worked on physical devices.
