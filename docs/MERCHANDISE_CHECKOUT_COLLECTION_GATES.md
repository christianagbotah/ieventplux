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


### Organizer merchandise reconciliation and CSV — 19 November 2026

- Added **Organizer Studio → Merchandise & Pickups**. A mobile-friendly operational dashboard displays confirmed paid receipts, souvenir units ordered/collected/outstanding, bounded stock reservations, per-SKU status and the latest 35 staff handover audit records. It never counts unpaid or exception orders as collectible. Ticket admission remains separate.
- `GET /api/v1/orgs/{orgId}/merchandise?eventId=...` requires authenticated, **accepted** organizational membership with `orders:view`, validates event ownership server-side, and returns `Cache-Control: private, no-store`. `CHECKIN_STAFF` and outsiders do not get access. Only roles with `org:view_finance` receive monetary totals; event managers see operations with financial values `null`.
- `&format=csv` is the same role-restricted endpoint; requires explicit `eventId` and omits revenue columns for nonfinance roles. CSV escapes quotes, delimiters, line breaks and spreadsheet formula prefixes, including whitespace bypasses. The UI discloses the product display cap and labels exports accordingly.
- **Real HTTP acceptance** against the isolated QA schema: ten role, scope, CSV and redaction checks passed (anonymous 401; outsider and check-in role 403; cross-org event 404; missing CSV event 400; event manager and finance requests 200 with appropriately redacted/included values). Direct isolated database tests independently matched paid-order counts and outstanding stock against synthetic orders, verified financial redaction and cross-org isolation. CSV safety has its own unit tests.
- Reporting is **read-only**. No payment activation, real refund action, barcode scanning or stock write is performed by this screen. The launch gate for checkout and physical handover remains separate and OFF in production.

### Physical merchandise refund safeguard

The existing ticket-refund provider workflow is **not** suitable for stock already paid for or handed over as physical souvenirs. A separate pre-provider policy now detects any souvenir order lines during `processRefund` and records a truthful `MANUAL_TRACKED` finance case instead. Its resolution note includes ordered/handed-over counts and states explicitly that provider refund, restocking and ledger reversal were **not** performed. Ticket-only orders retain their existing processing path. Unit tests cover ticket-only, uncollected, partial and fully collected variants and invalid counters. This is **not** a completed refund engine: finance still needs an evidence-backed return/reversal workflow and payment-provider reconciliation before production checkout can be enabled.

### Live schema drift — safely reconciled in Prisma (no production DDL)

An earlier read-only live-to-Prisma diff would have removed an unrelated `KycProviderJob.updatedAt` PostgreSQL `CURRENT_TIMESTAMP` default. Production already has this default; it must be preserved. The declaration in `prisma/schema.prisma` now explicitly uses `@default(now()) @updatedAt` for `KycProviderJob.updatedAt`, matching the existing live column **without changing production data or its default**.

Prisma schema validation passed. A new read-only `prisma migrate diff --from-url ... --to-schema-datamodel ... --script` against the actual live database on 19 November 2026 generated SQL that is **byte-for-byte identical** to the reviewed `docs/migrations/20261119_add_souvenir_order_collections.sql`. It contains **no `KycProviderJob` ALTER** and no unexpected table/column deletion. The intended `RefundCase.requestedBy DROP NOT NULL` loosens a constraint to support system-initiated finance exceptions; this is not column deletion. **No live SQL was executed during this comparison.**

This removes the previously detected KYC schema mismatch as a migration blocker. Remaining controls before live commerce include the reviewed production migration itself, provider settlement certification, physical goods return/refund reconciliation, and smartphone camera acceptance.

### Venue staff QR camera and printed receipt lookup — 19 November 2026

- Added `#/collect` as the staff's dedicated **Souvenir pickup scanner**, accessible via **Organizer Studio → Attendees & Check-in → Scan souvenirs** or **Merchandise & Pickups → Open pickup scanner**, and as a direct internal route.
- A rear-camera preview scans QR codes using the browser-native `BarcodeDetector` **where supported**. Unsupported mobile browsers and denied camera permissions display an explicit fallback: use the phone's camera application to open the customer's secure collection URL, or enter the printed `ORD-...` receipt reference. This is not a promise of universal in-app camera support; actual Android/iPhone visual testing remains outstanding.
- Printed `RCPT-ORD-...` numbers from the buyer receipt are normalized to the underlying `ORD-...` order reference. The parser in `src/portal/lib/souvenir-scan.ts` accepts only strictly signed `ORD-...` collection tokens, same-origin `/#/collect/{token}` links, or a printed `ORD-...` reference. It rejects admission ticket QR payloads, cross-domain redirects, malformed URLs and dangerous protocols. Parsing **never** authorizes pickup or automatically redeems a ticket.
- Added a **rate-limited**, authenticated `POST /api/v1/souvenir-collection/lookup` that turns a printed reference into an opaque, signed pickup token only after verifying the receipt contains souvenir lines and the caller is an **accepted** member with `checkin:scan` permission for the owning event. Disabled by the same default-off checkout rollout gate; returns only the signed token and never customer identity or payment details. Final customer/quantity verification still occurs through the protected receipt endpoint before separate explicit handover confirmation.
- Added staff sign-in return to `#/collect` and a **Scan another receipt** button after reviewing a handover.
- Isolated synthetic tests: 16 combined scanner, stock, pricing and refund unit-policy tests (62 assertions); nine staff receipt lookup HTTP checks for anonymous rejection, outsider/unaccepted/analyst rejection, invalid/not-found references, accepted check-in staff success, no personal data leakage in lookup response, and valid signed-token receipt access. Test harness `scripts/merchandise-scanner-route-qa.ts` refuses any schema except the isolated synthetic `ieventplux_merch_qa_20261119` schema. No live payment, customer data, SMS, selfie or real venue handover was involved.

**Activation remains blocked:** separate checkout and collection environment flags, the reviewed production schema migration, payment-provider sandbox/settlement, evidence-based refund/physical return process, and actual on-device scanner acceptance are still required. Neither feature is enabled on the production platform.

### Fresh production backup and tested isolated restore/migration — 19 November 2026

- Created private PostgreSQL 18 **custom-format** archive `pre-merch-migration-20261119T225253Z.dump` (3,071,032 bytes), owned by the application service account with POSIX mode `0600` in its existing restricted backup directory. SHA-256: `06ba45e7e7ae908fa30d4051d62776e78917105f385b0ec7826176bdd2048506`. Archive TOC contained 72 production application tables including `Order`, `KycProviderJob` and `EventSouvenirProduct`.
- Independently **restored** the production archive to an isolated, empty temporary database inside the dedicated iEventPlux PostgreSQL 18 cluster, using peer-authenticated local administrative access. The restored database contained all 72 application tables.
- Applied **only** the reviewed, additive `docs/migrations/20261119_add_souvenir_order_collections.sql` to the **temporary restored database**, not production. The rehearsal passed: two merchandise tables created; five foreign keys present; `RefundCase.requestedBy` nullable and `createdByKind` default present; the original `KycProviderJob.updatedAt` timestamp default was exactly unchanged.
- The temporary restore database was deleted after the test; a final catalog query confirmed **zero** remaining restore-test databases. Production web and DB health stayed healthy. No real payment/collection was executed and **no live schema migration was applied**.

**Production migration execution gate:** Revalidate a fresh pre-change archive, archived checksum and real `main`/PR head before executing this reviewed SQL. Run `psql` with `ON_ERROR_STOP` and a single transaction against the *explicit* target database (not against another cluster or an unreviewed schema change). Verify the exact same metadata after migration and keep both commerce rollout flags OFF. Prefer a separate off-host backup because VPS-local backups do not protect against total VPS/storage loss. Full provider settlement, returns/reversals, staff real-device acceptance and financial signoff are still required before enabling buyer checkout or physical collection.
