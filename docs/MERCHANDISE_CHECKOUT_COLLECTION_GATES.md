# iEventPlux — Merchandise ordering, receipts and staffed venue collection

Implementation increment: 19 November 2026. This is a review branch and **must not be deployed to the existing production database before the schema migration and payment QA**.

## What this increment implements

- Buyers can select one or more T-shirt sizes / souvenir SKUs in the existing event checkout, optionally alongside admission tickets. Ticket promotional codes do not discount physical merchandise.
- The backend verifies the event is bookable, checks the organizer is active, requires positive integer prices, sorts stock locks consistently and atomically increments `stockReserved` only when stock remains. A database transaction stores immutable `SouvenirOrderItem` price and quantity snapshots and the existing unified order/payment reference.
- Stock holds expire with the order; the worker releases abandoned merchandise quantities. A late confirmed payment may still be fulfilled only if stock remains. Otherwise the paid order is routed to `EXCEPTION_REVIEW` with an explicit refund case instead of inventing a collection right.
- Verified payment consumes reserved stock in the same transaction as ticket issuance and receipt creation. Merchant receipts distinguish ticket and souvenir lines, and the existing ledger retains the full paid amount.
- A settled receipt has a distinct collection QR: `https://ieventplux.lightworldtech.com/#/collect/{signed_reference}`. The QR contains only an HMAC-signed order reference, no personal information. Normal mobile cameras that can open URLs may open this link; **opening the QR never collects anything or admits anyone**.
- Staff sign in if necessary and must have `checkin:scan` permission for the event. They can inspect paid status, ordered, collected and remaining quantities, then confirm an actual physical handover in a modal. Each handover is stored in `SouvenirCollection` with staff identity, timestamp, partial quantity and idempotent client action ID. An atomic SQL update prevents overcollection even with competing devices. A refunded, unpaid, cancelled or disputed receipt cannot be collected.
- The admission ticket scanner and the merchandise collection scanner remain separate. A merchandise QR never grants venue entry.

## Launch gate — disabled by default

`IEVENTPLUX_SOUVENIR_CHECKOUT_ENABLED` defaults to **disabled**. Physical handover additionally requires `IEVENTPLUX_SOUVENIR_COLLECTION_ENABLED=1` on the server; neither switch alone permits collection. The public catalogue explicitly says ordering is unavailable and the POST `/api/v1/orders` server refuses any souvenir lines unless the value is `1`. Do not enable it merely because an admin saves Hubtel credentials.

**Before enabling:**

1. Review the code and full TypeScript/lint/automated tests and address GitHub CI findings.
2. Generate a schema migration against a clean copy of production. Take a verified database backup with restore evidence. Apply forward-only to staging first, and verify the two new tables, indexes and foreign keys. Do not use `prisma db push --accept-data-loss` against production.
3. Test at least: ticket-only checkout parity; souvenir-only paid order; mixed ticket+souvenir paid order; sale-window and invite-only auth; last-in-stock concurrent checkouts; duplicate/replayed callbacks; expired and late payment with stock reclaimed and exhausted; free RSVP unchanged; staff unauthorized access; repeated QR and network retries; partial collection; overcollection race; chargebacks/refunds; mobile Android camera URL; email/SMS receipt status.
4. Reconcile ledger fees, VAT/tax policy, event organizer settlement liability for physical products, refund/restocking policy and delivery/collection terms with the business owner.
5. Confirm live/sandbox provider settings and operator KYC; complete safe test transactions before accepting customer money. Keep feature gate **off** until all approval gates pass.

## Security boundaries

- Checkout item names, quantities and unit prices are always re-read from the database and rechecked in conditional updates; the browser cannot supply a trusted price.
- Private collection details are visible only after authenticated accepted organization membership with `checkin:scan` authorization. A QR or reference alone does not grant permission.
- Collection uses an explicit confirmation and an idempotent action ID. A retry resubmits the same action ID until the first outcome has been resolved.
- The collection route must have a separate rate limit and no cache; the generated QR is served only to the buyer or authorized event staff and only for fully paid orders.
- Avoid publishing provider secrets, customer contact information in the QR or a public collection receipt.

## Outstanding for subsequent releases

- Staging/production migration and an authenticated, real-device visual acceptance pass.
- Real Hubtel test transaction, end-to-end settlement and refund/restock verification; no live purchase feature enabled yet.
- Staff reconciliation/export report and reversal workflow for mistaken handovers, with independent approvals and audit history.
- Organizer fulfillment dashboards, collection station roster, and automated pickup notifications once provider delivery is verified.

## Isolated PostgreSQL integration QA — 19 November 2026

- Created a **separate PostgreSQL schema** named `ieventplux_merch_qa_20261119` on the VPS, with no changes to production application tables and no real user/payment records. `prisma db push` on that empty QA schema succeeded **without** `--accept-data-loss`.
- Generated a forward-only SQL diff `docs/migrations/20261119_add_souvenir_order_collections.sql` comparing the verified base schema at `4630105` against this branch. It contains only `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ... ADD CONSTRAINT` operations, and no destructive DDL. Production schema state still requires an audited comparison before applying it.
- Added repeatable `scripts/merchandise-isolated-qa.ts` which **refuses to execute without** a URL explicitly scoped to `?schema=ieventplux_merch_qa_20261119` and an enabled QA flag.
- Executed that synthetic integration script successfully. Tested: merchandise-only stock hold; last-in-stock rejection; internal simulated verified payment and one receipt; payment replay idempotence; partial collection; same action ID replay; overcollection rejection; sold/collected stock counters; combined ticket plus souvenir payment; free RSVP parity; two simultaneous buyers competing for the final SKU; and expiry release for unpaid stock. All test customer emails use `.invalid`; no actual provider checkout, biometric check, SMS or email delivery occurred.
- **Discovered and fixed a production-impacting Prisma/PostgreSQL issue:** selecting `pg_advisory_xact_lock` directly returned a `void` column Prisma could not deserialize. Both signed-in buyer checkout and souvenir collection now select a normal numeric column from the advisory-lock function. The isolated integration run exercises both paths.
- Hardened the expiry sweep to avoid overwriting paid orders with EXPIRED and to retain holds when an authoritative payment attempt has already reported SUCCESS.
- Extracted an auditable collection service with an Order row lock and atomic line update, preserving staff authorization and explicit physical handover confirmation in the API.

**Still required before live activation:** provider sandbox test/settlement validation, money receipt/refund/restock and fee-policy signoff, actual Android camera scanning, production DB backup/restore evidence, staging web route auth QA, and careful production database rollout. Preserve the default-off launch flag until these are complete.

### Financial exception audit validation

A further isolated synthetic scenario tested a late **paid** mixed ticket/SKU order where its hold expired and another buyer bought the last SKU. The original late payment correctly entered `EXCEPTION_REVIEW`, recorded one `RefundCase` with `createdByKind='SYSTEM'` and nullable `requestedBy`, issued no ticket or invoice, and **released the ticket hold** obtained during the failed fulfilment. This also exposed a pre-existing FK mismatch in automatic refund creation (`requestedBy='system:...'` had referenced no User) and repaired it without impersonating a buyer or organizer. The organizer Finance view now names these records **Automatic finance review** rather than showing a fabricated requester. The additive schema delta is included in the reviewed migration SQL. No live money or production customer record was involved.

### Authenticated staff QR HTTP acceptance — 19 November 2026

The actual Next.js staging API (127.0.0.1:3179), explicitly connected to isolated `ieventplux_merch_qa_20261119`, completed the **12 HTTP and database checks** in `scripts/merchandise-route-qa.ts`. Its strict test guard rejects any other database schema. Tests create synthetic user accounts with `.invalid` email domains and temporary sessions, never real customers. Both checkout and collection switches were enabled **only in staging**.

- Anonymous GET rejected (401); signed-in nonstaff, unaccepted invitations and analyst-only roles rejected (403).
- Tampered QR reference rejected (404); accepted CHECKIN_STAFF successfully opened a verified paid collection receipt (200) with `Cache-Control: private, no-store`.
- Unauthorized POST rejected (403) and missing handover confirmation rejected (400).
- Authorized POST recorded exactly one unit; replay with the **same** client action ID returned `ALREADY_RECORDED` without a second handover; a separate attempted overcollection returned conflict (409).
- Verified `collectedQty`, `stockFulfilled` and single `SouvenirCollection` ledger row; confirmed **admission Ticket rows were unchanged**.
- GET now explicitly reports `collectionEnabled` and sets `collectionAllowed=false` when rollout gates are off; the staff interface shows the disabled/awaiting-activation state rather than an actionable confirmation button.

This verifies HTTP authorization and business logic on localhost. It **does not** substitute for actual Android/iPhone camera QR testing, real gateway settlement, a production migration review or physical-venue UAT. The production buyer/collection switches remain off.
