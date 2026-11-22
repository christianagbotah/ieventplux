# Release B second main integration — 22 November 2026

This branch integrates main `dbbc5c0` without deploying or enabling live merchandise charging/fulfilment.

Conflict decisions:
- CI: retain souvenir QR, stock, return and staff-replay tests alongside the new enterprise UI, programme, event timing and meetings checks.
- Auth: preserve strict staff collection QR sign-in return and main's independently validated meeting invitation return; neither arbitrary redirect nor unauthenticated order disclosure is permitted.
- Event checkout: preserve souvenir quantity/combined basket and the newer responsive ticket registration dialog, promo restrictions for paid ticket selections and server-confirmed totals. No promise of enabled live merchant checkout.
- Organizer: retain both merchandise reconciliation permissions and group meeting management authorization.

Release gates still outstanding: exact-head CI, authenticated isolated PostgreSQL reservation/expiry concurrency and migration rehearsal with verified backup, real payment callback/reconciliation and refunds, staff-role and independent admission/pickup QA, physical Android/iOS camera-link validation, source-light artifact/rollback rehearsal. UX PR #46 remains isolated; no automatic merge without review.

## Local validation result

Focused policy suites passed (28 and 25 tests, zero failures). Local `tsc --noEmit` is **not green** after this merge: 21 errors are confined to newly introduced LiveKit dependencies absent from this worktree's pre-existing `node_modules`, and Prisma's locally generated client predating main's new meeting models. These packages are declared in `package.json` and models in `prisma/schema.prisma`; exact-head CI must install/generate in its isolated runner and confirm build before review. No package installation or schema push was run on the shared VPS.
