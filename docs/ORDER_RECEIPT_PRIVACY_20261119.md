# Order receipt, ticket and payment-status privacy hardening

**Scope:** iEventPlux buyer/organizer order detail APIs only. This release requires **no database schema migration** and no changes to ticket or payment-provider state.

## Threat closed

Previously `GET /api/v1/orders/{reference}` and `/suggestions` granted full order access when *any* Membership row matched the organization. An invited-but-unaccepted person could open a receipt containing customer identity, ticket codes, payment provider details and refunds merely by learning an order reference. An accepted venue `CHECKIN_STAFF` or `ANALYST` role was not distinguished. The first endpoint also serialized full PaymentAttempt records, including fields not required by any buyer UI (provider gateway tokens and raw result payloads).

## Enforced policy

- Sessions are checked **before** retrieving an order, returning 401 for anonymous requests instead of disclosing whether a reference exists.
- `canReadFullOrder` permits the matching authenticated buyer, or a *currently accepted* membership in the organizing organization with the existing `orders:view` permission. Pending invitations, deleted organizations, outsiders and check-in-only staff cannot access a full receipt (403). Staff QR collection continues to use its own minimal endpoint, not this detail API.
- Order detail responses select only `id`, `status`, `provider`, `attemptNo`, `reference` from PaymentAttempt. Raw result, checkout tokens, provider-private IDs and internal reconciliation state cannot be serialized by this endpoint.
- Both order detail and personalized suggestions return `Cache-Control: private, no-store`.
- The `confirm-free` operation now requires the **actual order owner ID** to match the signed-in user. Old anonymous/null-user orders cannot be finalized by someone who knows their reference.

## Acceptance evidence

Synthetic integration script: `scripts/order-access-isolated-qa.ts` refuses any database except the isolated `ieventplux_merch_qa_20261119` schema and calls localhost `127.0.0.1:3179`. It created `.invalid` accounts, a fake provider secret and a fake payment attempt, then passed **14 HTTP and content assertions**: anonymous rejection; outsider/pending invite/check-in-only denials; protected cross-sell suggestions; actual buyer success; absence of gateway token/raw data; accepted analyst/event manager success; no-store headers; and null-owner free order confirmation denial. No payment or delivery provider was called and no real customer data was read/written.

**Deployment acceptance:** TypeScript and production build, GitHub CI, version-sync smoke and rollback should succeed before production release. Changes do not enable souvenir checkout, souvenir collection or biometric verification. Keep all commerce feature flags disabled until their independent launch requirements are satisfied.

## CI seed correction discovered in this PR

GitHub's web job initially failed during development seeding because the signed-in checkout query directly selected `pg_advisory_xact_lock(...)`, a PostgreSQL function that returns a `void` value Prisma 6 cannot deserialize. Changed the query to `SELECT 1 AS locked FROM pg_advisory_xact_lock(...)`, preserving the exact transaction-scoped lock while returning a supported integer. This is the same safeguard already applied in the separately reviewed merchandise branch; landing it in the existing mainline checkout also makes full seeded CI testable. No new stock or fee behavior is introduced.
