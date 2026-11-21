# iEventPlux GitHub-built artifact pilot and storage-safe deployment gates

Date: 2026-11-21. Owner directive: [issue #42](https://github.com/christianagbotah/ieventplux/issues/42). Read `/home/lightworld/AGENTS.md` and `/home/lightworld/SHARED_VPS_DEPLOYMENT_POLICY_20261121.md` before any VPS work.

## Baseline (read-only observation, 2026-11-21 18:38 UTC)
- Shared root: 313 GiB, 277 GiB used, 34 GiB available, 90% reported by `df -h /`; capacity inspect reported 33.3 GiB free.
- Production homepage returned HTTP 200. Production source checkout HEAD `3a5d5dd`. This is **not** proof that every running process uses that SHA.
- Active process observed at `/home/lightworld/releases/ieventplux/meeting-paidgate-1b41af4/.next/standalone/server.js`. Other meeting release directories exist; their active/rollback status has **not** been verified.
- No active build processes reported by capacity inspect at observation time. This is not a reservation of disk capacity.
- Existing CI already contains a production-build job, but it does not upload a deployable, checksummed release candidate.

## Pilot: CI-only, no VPS deployment
The dedicated `.github/workflows/release-artifact.yml` runs on GitHub Actions, installs from the committed Bun lockfile, checks TypeScript and payment/check-in policies, creates an **ephemeral CI database only**, builds Next standalone, packages only `.next/standalone`, and uploads a 7-day artifact with exact `SOURCE_SHA`, `CI_RUN_ID` and SHA-256 manifest. Build logs, dependencies and source worktrees are not packaged. The workflow has read-only repository permissions and no deployment credentials. **Artifact generation does not authorize deployment or payments.**

CI must pass for the exact candidate SHA before any operator stages it. A failed/missing CI run is a hold. No local VPS `bun install`, `pnpm install`, `next build`, or `prisma db push` is part of this pilot.

## Manual release acceptance procedure (not yet implemented as automatic deployment)
1. Inspect `df -h /`, active systemd/PM2/Nginx paths, process handles, symlinks, recent deployments and competing build jobs. Run `/usr/local/sbin/lightworld-vps-capacity-check inspect`. For a prospective artifact of N compressed MiB run `/usr/local/sbin/lightworld-vps-capacity-check artifact N`; **honor HOLD**. Do not initiate a full VPS build when the `build` preflight holds.
2. Obtain the candidate from its exact GitHub Actions run, verify `SOURCE_SHA` equals the authorized Git commit and `sha256sum -c SHA256SUMS`. Validate the tar archive contains no absolute or parent-traversal paths and does not contain credentials; unpack to a **new, immutable** project-scoped release directory, never into the live checkout.
3. Before a cutover, verify durable uploads/media/recordings, DB and secrets remain outside the bundle. Establish a fresh recoverable pre-migration backup, rehearse additive SQL in isolated scratch PostgreSQL, and validate schema compatibility with the **existing rollback release**. Do not run destructive production db push.
4. Perform isolated boot, health, authentication/authorization, event, meeting, ticket, checkout, payment reconciliation and refund smoke tests. Require a rollback proof and explicit financial sign-off. Preserve ticket admission and merchandise collection as independent entitlements. **Do not enable merchandise charging or fulfilment** until full provider and physical-device acceptance.
5. Only after all gates, arrange a controlled service/symlink switch with verified rollback; check live health and pending financial transactions. Record exact source SHA, artifact SHA-256, deployment timestamp, release and rollback paths, health checks, and disk before/after.
6. Keep the active release and one verified rollback. For any older release, inspect all process references, symlinks, pending work and operator sign-off before retirement. For inactive project worktrees older than 14 days, only prune proven generated/ignored caches after verifying clean Git status and that they are not referenced. Never touch other projects, secrets, DB, audit logs, backups, media or unpushed code.

## Remaining blockers
- This workflow is an **unverified CI artifact pilot** until its first GitHub run succeeds and its checksum and boot are independently checked.
- There is **no production artifact cutover** or automated retention cleanup in this change.
- Existing Release B draft PR #23 has integration conflicts and still needs authenticated PostgreSQL/payment/refund/camera acceptance. Issue #42 remains open until release/rollback proof is complete.
