# iEventPlux — Paid souvenirs and QR collection, Phase 1

**Date:** 19 November 2026  
**Owner:** Lightworld Technologies Ltd.  
**Deployment prerequisite:** additively migrate two new tables using `db/migrations/20261119_merch_collection_foundation.sql` with a verified database backup. Do not use `db:push` with `--accept-data-loss`.

## Customer experience

- Event page lists each SKU/variant (e.g. T-shirt black, size XL), current stock and price (₵). Verified organizers with a real configured checkout provider may accept souvenir quantities in the same checkout as tickets, or a souvenir-only paid order.
- A single payment produces the standard paid order and receipt, now with ticket and souvenir rows. Event coupons discount **ticket rows only**; prices are taken from durable SKU snapshots in integer pesewas, never browser totals.
- After **verified payment** (not browser-return or simulated success), the buyer sees a receipt reference, a signed QR URL for staff lookup and quantities already collected. The QR carries only an opaque order reference and HMAC, no personal data.
- A receipt/collection QR **never** admits the buyer to the event. Ticket entry requires ticket check-in using the existing ticket QR and its own ledger.
- If Hubtel real checkout is unconfigured in production, online souvenir buying is **disabled** and the product catalogue remains visible. The app does not sell merchandise using a fake payment simulator.

## Staff experience

- **Organizer workspace → Souvenir collection → Open collection desk**, or scan the receipt QR using the ordinary camera on a smartphone. The signed URL opens `/#/collection/{token}`.
- Only signed-in accepted event staff with `checkin:scan` permission may inspect it. Staff see the event, order reference, buyer name, paid status and per-SKU ordered/collected/remaining quantities. They can also manually look up `ORD-...` references.
- Collection is a **separate explicit action** with quantity confirmation, cancellation before submission, idempotent `clientActionId` and a recorded collector, timestamp, SKU and quantity. Duplicate/extra collections are rejected without increasing the collected count. The receipt's status becomes partially/fully collected independently of admission.
- A REFUNDED, EXCEPTION_REVIEW or CANCELLED receipt is never automatically redeemable. Staff need separate authority for refunds and admission.

## Data integrity

- `MerchandiseOrderLine` binds a concrete SKU to an order with immutable product name, SKU, variant and price snapshots, ordered quantity and reservation status. `MerchandiseCollectionEntitlement` maintains separately validated collected/refunded quantities and revocation-version metadata. `MerchandiseCollectionAction` is the append-only per-entitlement journal of authorized staff collection actions. These three entities are the canonical PR #22 schema; no competing `SouvenirOrderItem` or `SouvenirCollection` tables are used.
- Checkout uses atomic conditional PostgreSQL stock updates for `stockReserved`, respecting `stockTotal - stockSold` and concurrent buyers. Organizer stock edits use matching conditional updates so they cannot undershoot reserved + sold units.
- Expiration worker releases unpaid holds, including souvenir-only orders. A late confirmed payment can reclaim stock if available; otherwise the existing financial exception/refund rail tracks the confirmed payment without creating a false paid receipt.
- Verified paid fulfilment, SKU `stockSold` increment and ticket issuance occur in one database transaction. A paid order's independent admission and merchandise collection counters never change together.
- When tickets are unavailable after late payment, merchant holds are explicitly released, avoiding permanently stranded physical inventory.

## Outstanding production acceptance tests

- Controlled sandbox checkout with real callback + amount validation, including duplicate callbacks and late expiry; real-provider credentials are currently unavailable.
- True concurrent checkout race and stock expiry/reconciliation tests against an isolated QA database.
- Authenticated Android/iOS camera → staff link → explicit partial collection → second scan → fully collected.
- Provider refund/restocking decision workflow for already collected goods. **Never automatically restock refunded collected products.**
- Explicit collection reversal with manager authorization and reason; not in Phase 1. Until then, erroneous handovers require manual reconciliation.
- Real seller payout/commission breakdown for merchandise distinct from tickets if pricing policy is changed.

**Important:** Paid merchandise is a real-money workflow. Do not declare end-to-end live verification until there is configured Hubtel/alternate checkout, a controlled payment sandbox, provider callback reconciliation and verified stock settlement. The production feature gate must remain fail-closed while that evidence is absent.

## Unified draft status and independent launch controls

This implementation consolidates the existing [draft PR #22](https://github.com/christianagbotah/ieventplux/pull/22) schema and pure entitlement state policy with the checkout/receipt/staff-collection code. Only the three `Merchandise*` tables are proposed. Do not apply the obsolete alternative `Souvenir*` SQL migration.

All production merchandise charging is **disabled by default** until both `IEVENTPLUX_MERCH_CHECKOUT_ENABLED=true` and `IEVENTPLUX_MERCH_QA_APPROVED=true` are explicitly set after verified payment, stock, refund and access-control QA. Collection mutation also requires `IEVENTPLUX_MERCH_COLLECTION_QA_APPROVED=true`. The present site has **no configured real Hubtel checkout**, so no customer charge or pickup is authorized. The staff lookup page may provide read-only guidance; collection approval cannot occur without the separate gate.

The PR remains **draft** and the production database/schema is unchanged. Full authenticated staging, provider sandbox callback, refund reconciliation, short-lived/revocable QR and actual phone-scanner acceptance are outstanding.
