# iEventPlux — current shared Lightworld VPS deployment

**Verified 14 November 2026.** Unlike the generic Caddy/port-3000 guide in `DEPLOYMENT.md`, this running environment uses Webuzo-managed Nginx on a shared Lightworld VPS. The code deployment is **operational for UAT**, not certified for live financial transactions.

## Public URL and deployed source

- Public URL: **https://ieventplux.lightworldtech.com/**
- Deployed app source: `/home/lightworld/webapps/ieventplux`
- Exact **application build** revision: `e54a0ec3baa093c86d6c5bb4ded347d9479472c4` (Round 41). The follow-up status-documentation commit does not alter application code.
- Webuzo provides a valid Let's Encrypt certificate and Cloudflare fronts the hostname over HTTPS.
- Webuzo's generated vhost includes `/var/webuzo-data/nginx/custom/domains/ieventplux.lightworldtech.com.conf`, which is the **durable, domain-specific reverse proxy customization**. It sends web/API traffic to loopback `:3160`, `/socket.io/` to `:3162`, and leaves other domains alone. The common Webuzo vhost has a competing exact `location = /`; the custom include handles this via a private internal rewrite. Do not replace the Webuzo-managed vhost with the repository's *development* Caddyfile.
- HTTP redirects to HTTPS. The domain intentionally sends `X-Robots-Tag: noindex` during acceptance testing; remove only at final approved public launch.

## Isolated services

| systemd unit | Local endpoint | Function |
| --- | --- | --- |
| `ieventplux-web` | `127.0.0.1:3160` | Next.js standalone web/API |
| `ieventplux-worker` | `127.0.0.1:3161` | Durable outbox and reservation sweeps |
| `ieventplux-realtime` | `127.0.0.1:3162` | Socket.IO / presence |
| `ieventplux-postgres` | `127.0.0.1:55450` | Dedicated PostgreSQL 18 cluster |
| `ieventplux-monitor` | — | Health/alerts |
| `ieventplux-backup.timer` | — | Daily local PostgreSQL dump |

The environment file is stored at `/home/lightworld/private/ieventplux/production.env` with owner-only permissions. **Never display, commit or copy its secret values.** This host also serves other applications on ports 3000/3001/3003; do not change or restart their services for iEventPlux maintenance.

## Verified checks (14 November)

- Origin TLS certificate trusted; Cloudflare HTTPS delivers the correct iEventPlux homepage.
- `GET /api/v1/health` is healthy with PostgreSQL up and zero configuration errors.
- Public discovery and OpenAPI GET succeeded; payment simulator GET returned **403** in production.
- Direct Socket.IO polling succeeded; **Cloudflare WebSocket upgrade returned 101**. A foreign `Origin` was rejected with HTTP 403.
- HTTP redirects to HTTPS. Probes for `.env`, `.git/config`, `package.json` and raw Prisma schema yielded 404.
- All five main services are active; ops monitor recorded app, worker, realtime and DB as UP.
- Initial JSONL and custom `pg_dump` backups succeeded; a custom dump was restored into an isolated scratch database and then dropped (table counts matched). **Offsite replication/PITR are not set up.**
- Web/mobile/production-build CI all passed on the deployed app revision.

## Operator read-only checks

```bash
systemctl is-active ieventplux-web ieventplux-worker ieventplux-realtime ieventplux-postgres ieventplux-monitor
nginx -t
curl -fsS http://127.0.0.1:3160/api/v1/health
curl -fsS http://127.0.0.1:3161/health
curl -fsS http://127.0.0.1:3162/health
curl -fsS https://ieventplux.lightworldtech.com/api/v1/health
systemctl list-timers --all | grep ieventplux
```

Do not run the mutating, demo-user seed smoke suite against this database. Avoid destructive database `push --accept-data-loss`. Preserve known-good builds and backups before upgrades.

## First administrator and remaining launch gates

The production database was created without demo accounts. On **2026-11-19**, the initial
`SUPER_ADMIN` was confirmed to exist and the obsolete Nginx 503 registration block was
removed from `/var/webuzo-data/nginx/custom/domains/ieventplux.lightworldtech.com.conf`
(after taking a configuration backup, validating Nginx, and reloading). The live public
`POST /api/v1/auth/register` route now reaches the application and returns normal
structured validation errors. No demo-user seed was run. Registration remains separate
from payment/financial launch certification.

**Organizer-type-specific onboarding (2026-11-19):** Personal, Church, School, Business,
Ministry and Association each have tailored profile forms. `Organization.profileDetails`
is a separate validated JSON field with an additive schema change in
`scripts/migrations/20261119_organizer_profile_details.sql`. This migration must be
applied to production PostgreSQL before deploying code that queries the new column.
Existing records default to `{}`; private business registration numbers are never
returned by public profile endpoints. The editing screen uses the saved type and
specific fields. Only institutional types requiring documents are checked for
registration evidence, while personal users provide a government ID and selfie.

**Email verification is not yet configured on the VPS:** SMTP is currently unavailable,
so registration must accurately tell users that verification emails cannot be delivered.
Do not imply a verification email was sent until a real SMTP delivery test has passed.

The original one-time admin bootstrap instructions are kept in `DEPLOYMENT.md`, but
must **not** be rerun against this populated database.

**Still not certified:** Hubtel collections/payouts/SMS, SMTP transaction delivery, Cloudflare Stream ingestion/playback, durable offline check-in across browser reloads, full real-device/browser accessibility QA, offsite backup/recovery rehearsal, and financial go/no-go. These must remain disabled or unavailable until verified. Monitor shared disk utilization (about 91% at deploy) and swap pressure before onboarding customers.

For broader gate requirements, continue to use `GO_LIVE.md` and `UX_MODERNIZATION_ROADMAP.md`. This document records **actual VPS implementation**, not an assertion that every release gate has passed.
