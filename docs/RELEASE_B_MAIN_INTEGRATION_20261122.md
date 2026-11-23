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

## QA database URL hardening — 22 November, later run

The synthetic merchandise guard now accepts only the `schema` query parameter
and rejects fragments. This blocks unexpected Prisma/PostgreSQL connection
parameters (including `sslmode`, `pgbouncer` and `application_name`) rather
than trying to enumerate every possible override. Existing checks for loopback,
explicit disposable database name, exact schema and actual PostgreSQL session
identity remain mandatory. The guard test now checks twelve rejected URLs.
This is a *safety preflight*, not a successful database-backed concurrency,
provider payment or refund acceptance run.

### 23 November — isolated QA import-order hardening

The scratch-PostgreSQL merchandise harness now imports Prisma and database-backed ordering, fulfilment and collection services **only after** the QA connection guard verifies the loopback scratch database and exact schema. Previously, static service imports could initialize Prisma before the guard ran. The harness also disconnects its client in a finally block on assertion failures. This is an execution-order safeguard, not proof of gateway-backed payments or a staging release. Charging and fulfilment remain disabled pending the original acceptance gates.

### 23 November: scratch QA import-order hardening

Five additional isolated financial acceptance scripts (authenticated QR collection,
manual scanner lookup, route-level reporting, reconciliation and physical returns)
now defer Prisma and session-service imports until the scratch PostgreSQL URL,
actual database and schema have been verified. All five disconnect on failure.
The isolated integration harness already followed this ordering. CI now tests
the import ordering of all six scripts to prevent regressions.

This does not mean the HTTP acceptance tests or actual merchant settlement have
passed. Those require an isolated local staging stack and disposable PostgreSQL
fixtures, and remain mandatory before enabling checkout or collection.

## 23 November: dedicated scratch PostgreSQL CI gate

Added a separate `merchandise-scratch-acceptance` GitHub Actions job that provisions a disposable PostgreSQL database and explicit QA schema on loopback, applies Prisma schema only there, and executes the six guarded merchandise acceptance scripts sequentially. It does not deploy, use merchant credentials, or enable merchandise flags in the production environment. This job must pass on the exact PR head; its synthetic payment tests do **not** substitute for real provider reconciliation, refund certification or physical smartphone acceptance.
## 23 November: first verified disposable PostgreSQL acceptance CI (exact SHA)

GitHub Actions run [45101077226](https://github.com/christianagbotah/ieventplux/actions/runs/45101077226), for PR #23 head `847cdfd1933cb0548cdf95f034e987e77d128984`, completed successfully. All four jobs (`web`, `mobile`, `production-build`, `merchandise-scratch-acceptance`) reported SUCCESS. This is an **isolated synthetic QA milestone**, not merchant certification.

The scratch PostgreSQL job logs explicitly confirm:
- Atomic last-SKU reservation under concurrent checkout, last-ticket-cap concurrency, and unpaid reservation expiry.
- Simulated verified payment and concurrent callback replay: a single receipt, no duplicate entitlement, and distinct ticket-admission vs merchandise-collection states for combined orders.
- Authenticated HTTP QR collection: anonymous/nonstaff/unauthorized-role rejection, tampered-signature rejection, explicit physical handover confirmation, idempotent replay, and overcollection conflict.
- Authorized printed-receipt lookup without buyer-contact disclosure, operational/finance reporting permission and money redaction, cross-organization denial, and physical return intake with separate finance approval and no premature refund/stock mutation.

**Remaining release blockers:** no real Hubtel/provider payment initiation-to-callback-to-settlement reconciliation or provider-backed partial/full refund certification has been demonstrated; no physical Android/iOS HTTPS camera/QR field acceptance; no verified pre-migration production backup, additive migration rehearsal against production-shaped scratch data, checksum-verified artifact rollout/rollback and production auth/security smoke sign-off. Do not enable `IEVENTPLUX_SOUVENIR_CHECKOUT_ENABLED` or `IEVENTPLUX_SOUVENIR_COLLECTION_ENABLED` until those gates are complete. No production transaction or deployment was performed by this CI run.
