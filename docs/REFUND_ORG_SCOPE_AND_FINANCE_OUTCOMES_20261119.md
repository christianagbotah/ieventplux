# Organizer refund authorization and financial-outcome accuracy

**Release scope:** a migration-free production security fix. It does not modify the Hubtel integration, process a real refund, activate souvenir ordering or add/alter tables.

## Authorization flaw and repair

Before the patch, `POST /api/v1/orgs/{orgId}/refund-request` verified that the acting user had `refund:request` permission in the organization named in the URL but forwarded an arbitrary caller-provided `orderId` to a generic service that fetched the order **without organization scope**. An authorized finance user could therefore attempt to open a refund review and change an order in an unrelated organization by supplying its internal ID.

`requestRefund` now *requires* a typed `scope`: either `{kind:'organization', orgId}` or `{kind:'buyer', userId}`. Its order lookup always includes the corresponding ownership predicate. Both the organizer route and existing buyer refund route supply their independently authenticated scope. Calls that fail ownership checks return a non-disclosing 404 before a case is created or order status changes. Organization requests are also rate limited, require a sanitized reason of at least 10 characters, and record audit provenance of successfully created cases.

## Refund exceptions and truthful admin feedback

Rejecting a requested refund for an order that already has an unresolved `exceptionReason` now restores `EXCEPTION_REVIEW`, **never `PAID`**. It cannot create sale/collection entitlements for an unfulfilled late-payment exception. Normal paid-order declines continue restoring `PAID`; earlier partial refunds remain `PARTIALLY_REFUNDED` when no exception exists.

The platform admin Refunds action toast now uses a dedicated tested outcome helper. `MANUAL_TRACKED` clearly states **no provider refund, stock return, ledger reversal or ticket revocation took place**. `APPROVED` is explicitly not paid; `PROCESSED` requires separate provider/ledger confirmation. Unrecognized statuses are not treated as success.

## Isolated verification

`scripts/refund-scope-isolated-qa.ts` refuses any database outside `?schema=ieventplux_merch_qa_20261119` and exercises the real HTTP endpoints on localhost:3179. All synthetic accounts use `.invalid` domains; orders belong only to the isolated QA schema. Passed: cross-org finance request denied (404, zero foreign order/refund changes); forged URL scope denied (403); authorized own-org request; ordinary rejection restores paid; and exception-order rejection stays `EXCEPTION_REVIEW`. No payment provider calls, real customer data, or actual refunds were involved.

`src/portal/lib/refund-feedback.test.ts` asserts five financial-outcome policy cases, all passing.

**Deployment gates:** TypeScript and ESLint, GitHub CI, optimized build, health and security smoke tests with preserved rollback. The reviewed merchandise migration remains separate and must not be installed as part of this security fix.
