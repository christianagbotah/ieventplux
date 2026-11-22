# iEventPlux — Following timeline (social-community milestone)

This increment makes organizer follows useful after an event has been published.

## The social product

- Desktop + mobile navigation leads to a real /following portal screen.
- Signed-in users see chronological activity of actual public events and
  public event announcements from followed organizers.
- Follow/unfollow actions update the organizer follower count and future feed.
- Users refresh, paginate via opaque cross-source cursors and manage follows.
  Empty states recommend real organizer profiles, not invented content.
- Following is distinct from Discover: no sponsored/featured insertion and
  no private, unlisted, invited, draft, cancelled or suspended-org events.
- Following API requires an active session, filters owners blocked in either
  direction or muted by the viewer, and sends private no-store responses.
- Forged IDs cannot follow an inactive/suspended organizer or user; a blocked
  user/owner cannot be followed.
- Fixed broken My Account View feed link.
- Event-preview imagery no longer impersonates a working video player; its
  primary action now opens the related event.
- Zero schema changes and no new provider dependencies.

## Technical contracts

GET /api/v1/social/feed?cursor=<opaque>&pageSize=12

- First call omits cursor; response includes items (EVENT or UPDATE),
  followingCount, hasMore, nextCursor (null at end).
- Keyset order: createdAt DESC, source kind+ID DESC. Equal-timestamp UPDATE
  sorts before EVENT. Per-source deterministic seeks avoid offset duplication.
- Invalid/malformed cursor returns 400.
- No private attendee fields or third-party stream credentials in responses.
- The feed does not infer engagement or insert unrelated events.

## Verification and launch

- Bun unit tests cover privacy filters, empty follows, cursor validation,
  cross-table tie ordering and pagination boundaries. A real HTTP integration
  smoke runs only on a localhost development seed. It creates and cleans up
  synthetic public/unlisted events, announcements, follow/unfollow state and
  a temporary block; it must never run against live customer records.
- GitHub CI runs tests, web/mobile typecheck and standalone production build.
- No production migration or payment provider switch is needed.
- Device UAT: test real sign-in, follow/unfollow, chronological updates and
  attendee access, excluding private/invite-only events.
- Future: verified user-uploaded media playback, community groups, notification
  opt-in, creator profiles, spam resistance and moderation.
