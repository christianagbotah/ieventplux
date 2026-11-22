# iEventPlux SFU access reconciliation — test deployment runbook

The user-facing media experience has no fixed application cap. **Do not introduce a new participant limit** to work around revocation or client rendering. P2P legacy mode remains intentionally limited to six; in SFU mode the room cap is zero.

## Why a server-side guard is required

A 60-second signed LiveKit token admits a user to the media room. A client can ignore a browser-based 15-second access check. Furthermore, LiveKit self-hosted `RemoveParticipant` disconnects a participant but does not guarantee a previously issued JWT cannot reconnect before its expiry. The independently operated SFU guard therefore reconciles active participants every ~15 seconds against the existing iEventPlux database, even when a client is modified.

The guard does not issue tickets, change payments, reset the database, or affect another service.

## Decisions and performance

- The guard lists only room names beginning with `ieventplux-meeting-`, ignores unrelated SFU rooms, and never uses browser-supplied roles.
- It closes a media room when the durable meeting or parent event has ended, been unpublished, deleted or suspended.
- For an active room, it queries organization memberships, approved free-event RSVPs, valid/checked-in tickets, paid ticket type presence, and bans, all scoped to the same event and meeting.
- Host roles are the same as the web application's `broadcast:manage` permission (OWNER, ADMIN, EVENT_MANAGER) plus verified organization owner ID. Cancelled/refunded/revoked tickets do not admit participants. Paid events never accept RSVP-only media entry.
- Queries are batched into 200 user IDs **only to bound database query size**; 200 is not an attendance or media limit.
- A database outage is NOT treated as permission denial; the guard retries instead of disconnecting legitimate attendees. Failed remote removals are logged as counts.
- The organizer's `screenShareEnabled=false` is enforced by LiveKit's signed `canPublishSources` JWT grant, not just a hidden UI control.
- Large-room browser tiles use a 12-tile page. All attendees remain connected regardless of the displayed page.

## Configuration for existing testing domain

Use the same protected environment files already supplying iEventPlux. Guard needs `IEVENTPLUX_MEETING_MEDIA_ENGINE=sfu`, `DATABASE_URL`, and the strong `MEETING_SFU_INTERNAL_HTTP_URL`, `MEETING_SFU_API_KEY`, and `MEETING_SFU_API_SECRET`. The SFU already runs on localhost port 7880 and media UDP 7882 / fallback TCP 7881 via the existing `https://ieventplux.lightworldtech.com/livekit/` proxy.

Install a dedicated `ieventplux-sfu-guard.service` systemd unit with:
- `User=lightworld`, `Group=lightworld`, protected environment files, executable `/usr/local/bin/bun mini-services/sfu-guard/index.ts` from the exact verified release.
- `MemoryMax=512M`, `CPUQuota=75%`, `NoNewPrivileges=true`, `PrivateTmp=true`, `ProtectSystem=full`, `ProtectHome=read-only`, restart on failure.
- Optional `IEVENTPLUX_SFU_GUARD_DRY_RUN=true` during test: reports evictions and closed-room decisions without performing media mutations. Never keep this set when enabling enforcement.
- Starts after `ieventplux-sfu.service` and `ieventplux-postgres.service`; automatic start only after staging test verification.

## Testing and rollback

1. GitHub CI web/mobile/production-build including `meeting-sfu-guard-policy.test.ts`, plus TypeScript/lint.
2. Isolated LiveKit synthetic room with no matching database event: dry run reports `closed=1` without deleting it; enforcement deletes it. No real user or payment records.
3. Two-device camera/microphone/share tests, unauthorized user and RSVP/ticket revocation tests, host removal/restore, event end.
4. Confirm all relevant services active and homepage, API health, Socket.IO and LiveKit endpoints respond 200.
5. Roll back by disabling/stopping `ieventplux-sfu-guard.service` and restoring prior web/realtime systemd drop-ins; no database schema changes are needed.

**Scaling caution:** 4 CPU / 16 GB VPS has limited media egress capacity. No application cap is not unlimited physical capacity. Test 10/25/50 concurrent users from independent machines before declaring high-volume worldwide readiness.
