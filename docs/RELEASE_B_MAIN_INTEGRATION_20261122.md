# Release B integration with main — 22 November 2026

Scope: merge main `3a5d5dd` into the isolated merchandise checkout PR #23 branch. This is **not** a production release or permission to enable merchandise charging or collection.

## Conflict decisions

- `.github/workflows/ci.yml`: retain both souvenir policy tests and main's attendee/scanner/admission, ticket-selection, discovery and provider-health regression tests.
- `src/server/services/ordering.ts`: retain atomic ticket + souvenir reservations and the disabled-by-default souvenir checkout gate; incorporate main's GHS paid-ticket currency guard both before and within the transaction, including its conditional SQL reservation update.
- `src/portal/views/EventDetail.tsx`: retain merchandise quantities and server-confirmed combined checkout; incorporate main's supported ticket selection, availability, quote validation and booking restrictions. A souvenir-only order remains server-gated until explicit release authorization.
- `src/portal/views/OrganizerWorkspace.tsx`: preserve merchandise reconciliation and collection entry alongside main's event-scoped attendee deep links and admission-monitor refresh. Do not render duplicate attendee views.
- `src/server/souvenir-policy.test.ts`: express invalid stock-counter inputs as three explicit arguments to satisfy TypeScript's tuple checking.

## Evidence and remaining release gates

Focused souvenir, scanner, attendee, admission and ticket-selection tests passed locally; TypeScript must pass before this merge is accepted. GitHub Actions exact-head CI, isolated scratch-DB concurrency, verified pre-migration backup and additive migration rehearsal, authenticated API authorization, real payment-provider reconciliation/refunds, and physical Android/iOS HTTPS QR review/collection remain outstanding. No production database change, live payment, fulfilment toggle or production deployment is authorized by this integration.

Shared VPS storage was 85% used, ~49 GB free; no Next.js build or package installation was performed here. Follow issue #42 for source-light CI artifacts and rollback verification. Keep UX PR #46 isolated and subject to review.

## 22 November: isolated QA destination hardening

The synthetic merchandise reservation QA and physical-return HTTP QA now call the common database isolation guard before their first fixture/query. That guard verifies both a disposable loopback PostgreSQL database name and the actual connected session schema. A new CI regression test checks that missing, remote, production-named, wrong-schema, duplicate-schema and PostgreSQL host/options override URLs are refused before the database client is imported. This does not replace a real scratch-database run or authorize payment/collection flags in production.
