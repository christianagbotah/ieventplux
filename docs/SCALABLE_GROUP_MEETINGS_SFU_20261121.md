# Scalable event meetings — SFU architecture and release gate

## Decision
The fixed six-person ceiling belongs **only** to the legacy peer-to-peer mesh mode. An unlimited fixed **product** attendee cap is the requirement. Self-hosted SFU media is bandwidth/CPU constrained, so **do not promise infinite simultaneous video on a four-core VPS**.

- **Default**: `IEVENTPLUX_MEETING_MEDIA_ENGINE` unset / `mesh`. Existing permitted 2–6-person media meetings continue without disruption; existing event group chat is not limited to six users.
- **Scalable**: `IEVENTPLUX_MEETING_MEDIA_ENGINE=sfu` plus all four strong private `MEETING_SFU_*` settings. LiveKit-backed video rooms use `maxParticipants: 0` (no software ceiling), paginated video, adaptive media and the existing persistent ticket-protected chat.
- **Misconfigured SFU**: explicit `unavailable`, never an implicit fallback to six peers.

## Same-domain configuration

The user-designated staging and test URL remains **https://ieventplux.lightworldtech.com**. No extra website is created. Private settings in the protected existing iEventPlux service environment:

```sh
IEVENTPLUX_MEETING_MEDIA_ENGINE=sfu
MEETING_SFU_PUBLIC_WS_URL=wss://ieventplux.lightworldtech.com/livekit
MEETING_SFU_INTERNAL_HTTP_URL=http://127.0.0.1:7880
MEETING_SFU_API_KEY=<strong random key>
MEETING_SFU_API_SECRET=<strong random secret, at least 32 characters>
```

LiveKit signaling uses a WebSocket-upgrading Webuzo custom Nginx location `/livekit/` pointing to the **loopback-only signaling service** `127.0.0.1:7880`. Media needs a deliberately configured, tested UDP listening port (e.g. 7882/udp) and TCP fallback (7881/tcp). Do not modify unrelated application vhosts, expose the API secret, use a proxied TURN DNS record, or open whole UDP ranges blindly. Keep existing coturn and the original mesh release rollback available.

LiveKit server configuration should explicitly define `rtc.udp_port`, `rtc.tcp_port`, `rtc.node_ip` (correct public IPv4) and a strong shared `keys` entry matching the private app values. Use signed/checksummed upstream binaries, systemd sandboxing, resource limits, firewall checks and HTTPS WebSocket verification before enabling the SFU flag. LiveKit runs without cloud service fees when self-hosted. Scale media onto dedicated SFU nodes with Redis as needed; HLS/streaming is a separate broadcast fanout path.

## Access and lifecycle

1. Host creates a room for a published event. Approved free-event RSVP or valid paid-event ticket remains mandatory to join as an attendee. The guest-code mechanism cannot bypass paid admission.
2. `POST /api/v1/meetings/:id/sfu-token` requires the user's own authenticated session, existing meeting entitlement and active room state. The server generates a scoped, short-lived LiveKit JWT. API secret never leaves the server.
3. Each user joins as their authenticated user ID. Browser tracks connect directly to SFU; stored group chat still uses the existing authenticated API and Socket.IO chat room.
4. Host **End for everyone** deletes the LiveKit room before closing the durable meeting. Host ban updates the durable ban table and calls LiveKit `RemoveParticipant`; revoked RSVPs/tickets also cause the client to leave on server recheck. A malicious modified client could ignore rechecks, so server-side periodic entitlement reconciliation is required before a broad public launch.
5. Data and payment endpoints are not changed by switching media engines. The `maxParticipants=0` sentinel means no fixed application limit, not free capacity, and host invites are separately rate/cap controlled.

## Release / acceptance gates

- All prior API, meeting lifecycle, RSVP, ticket, ban and realtime smoke tests remain green in GitHub CI.
- Pure `meeting-sfu-policy` tests prove *mesh six maximum*, *SFU zero/no fixed cap*, *invalid config unavailable* and no unsafe fallback.
- Production-build, lint and TypeScript checks succeed; isolated web/real-time probes pass on disposable ports.
- External HTTPS/WSS signaling, authenticated JWT admission and denial, LiveKit room create/join, camera/mic tracks, host kick/end, desktop screen share and phone-browser controls tested with at least two distinct networks.
- Measure CPU, memory and **outbound traffic** under synthetic 10/25/50-user load before declaring a larger production capacity. Add dedicated media nodes and autoscaling for thousands of attendees.
- **Do not enable SFU for users until server/WSS/ICE connectivity is confirmed.** Existing mesh mode stays available during rollout.

Rollback: unset `IEVENTPLUX_MEETING_MEDIA_ENGINE` or set `mesh`, return to the previous web/realtime service drop-ins, verify public home/health/Socket.IO and coturn. Never destructively reset or seed the user's real database.
