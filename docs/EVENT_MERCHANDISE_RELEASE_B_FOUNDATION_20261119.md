# Event operations Release B: disabled merchandise foundation

This branch adds **only** a schema and pure entitlement state policy. It does not enable checkout, payment collection, QR redemption, refunds or stock changes. `MERCHANDISE_CHECKOUT_ENABLED` and `MERCHANDISE_COLLECTION_ENABLED` remain `false` and no API routes consume the new tables.

- Each `MerchandiseOrderLine` links an existing order and a concrete event SKU, snapshots unit price and variant, and has a bounded `reservedUntil`. No inventory is claimed until a future transaction-safe reservation implementation.
- Each `MerchandiseCollectionEntitlement` has an independent status and counts for purchased, collected and refunded quantities. No ticket or admission record is modified by its state machine.
- `MerchandiseCollectionAction` provides an append-only idempotency-key uniqueness constraint and actor journal for future authorized staff actions. It does **not** itself implement authorization, locking, token issuance or auditing.
- Database check constraints prevent impossible quantity combinations; code rejects overcollection, unpaid collection, cancellation after payment and refund of delivered units. Actual refund processing still requires provider-confirmed financial reversal and a more detailed partial-refund status model.
- Apply `db/migrations/20261119_merch_collection_foundation.sql` **only** after a schema-only scratch clone rehearsal and a verified fresh recoverable production backup. It is additive, does not modify existing Order/Ticket/PaymentAttempt rows, and must not be applied using destructive Prisma db push.

## Required before any paid launch

Implement combined ticket+merchandise atomic stock holds with expiry; provider server-to-server verification and amount/currency reconciliation; durable receipt references and scoped, revocable signed HTTPS QR links; staff login and event-specific roles; independent Review → Confirm admission / Review → Confirm pickup workflows; per-item partial fulfilment and refund accounting; replay-safe action transactions; delivery reporting; staging integration tests including concurrent final-stock attempts and actual mobile camera link tests. Never expose customer order PII to anonymous QR viewers. Complete sandbox and refund QA, then obtain explicit live charging sign-off.

## Integrated draft update (same PR)

The checkout/order/receipt/collection implementation has been developed on top of this canonical three-entity schema. It remains **draft and disabled**. The new services perform bounded SKU holds with a conditional SQL update, verified-payment conversion, expiry/late-pay exception handling and idempotent authorized pickup journal entries. The customer and staff screens are wired but cannot accept real charging or collection until explicit QA release gates are enabled. This is not an assertion that money or QR flows were tested end to end. See `docs/SOUVENIR_CHECKOUT_COLLECTION_20261119.md` for implementation details and unresolved test gates.
