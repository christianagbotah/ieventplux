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

`IEVENTPLUX_SOUVENIR_CHECKOUT_ENABLED` defaults to **disabled**. The public catalogue explicitly says ordering is unavailable and the POST `/api/v1/orders` server refuses any souvenir lines unless the value is `1`. Do not enable it merely because an admin saves Hubtel credentials.

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
