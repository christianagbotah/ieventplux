# Merchandise Release B — gate check (2026-11-20 04:36 UTC)

This is verification evidence, **not** approval to enable payments or collection.

- Production `GET /api/v1/health` returned `healthy` with database `up`; Hubtel checkout credentials are absent, and live checkout is unavailable.
- Latest fetched `origin/main`: `b2c575a`; merchandise draft branch at start of check: `f368b74`. Draft PRs #21, #22 and #23 are open. Existing worktrees were reused; no production deployment or migration was attempted.
- Focused command: `bun test src/server/souvenir-policy.test.ts src/server/souvenir-checkout-policy.test.ts src/server/souvenir-refund-policy.test.ts src/server/souvenir-return-policy.test.ts src/portal/lib/souvenir-scan.test.ts`.
- Result: **20 passed, 0 failed, 88 assertions**, Bun 1.3.14. Prisma logged `DATABASE_URL` absent; these are policy tests, not integration evidence.

## Remaining hard blockers

Keep checkout charging and merchandise collection feature flags **OFF**. Obtain current TypeScript, CI and isolated optimized-build evidence for PR #23; reconcile overlapping PR #21/#22 schemas; rerun additive migration on scratch PostgreSQL after verified backup/restore; run authenticated staging checkout with provider-confirmed callback, timeout/replay, refund and restock reconciliation; prove independent ticket admission and souvenir pickup including Android/iPhone native-camera HTTPS QR, staff role denials and duplicate scans. Do not treat browser redirect, mock payment or these policy tests as financial acceptance.

No production data, credentials, files or deployment artifacts were modified by this gate check.
