# Marketplace live basket preview — web and native, November 24, 2026

This development increment introduces a real **read-only, price-authoritative basket quote** for independent sellers. It is part of the broader iEventPlux social/marketplace plan and must not be mistaken for completed checkout or global-scale commerce.

## Shared route and UX

`POST /api/v1/marketplace/stores/:slug/quote` accepts only `{ "items": [{ "variantId": "...", "quantity": 2 }] }`. No prices, currencies, discounts, store IDs, delivery charges, identities, shipping addresses or payments are accepted from the client. Unauthenticated browsing is permitted, but requests are database-rate-limited to 30/min per scope+IP.

The server requires an existing, active, non-deleted store; each variant must belong to it and remain active, with an active, non-deleted **physical goods** product. Price is read from the server as an integer minor-unit amount; only the currently supported store currency `GHS` is accepted and the UI shows **₵**. Available quantity subtracts stock already reserved. Requests with hidden variants, insufficient stock, unsupported currencies, bad prices, repeated IDs or invalid quantities fail closed. Up to 15 distinct variants, 20 units per variant, 50 total units, and 100,000,000 minor units are permitted per quote.

The response returns the actual product and SKU names, per-unit price, requested quantities, available stock, merchandise subtotal and quoted timestamp. It always declares `checkoutEnabled:false` and `inventoryReserved:false`; the response is `Cache-Control: private, no-store`. Nothing is saved as an order, payment, stock hold, invoice or merchant acceptance.

Browser and Android/iOS storefronts now support a quantity stepper for each available variant, a basket selection summary and a server-side **Check prices & stock** action with clear error and quote displays. Changing a quantity invalidates the previous quote; a new API response is required. Seller editors retain their independent inventory operations. Native layout keeps quantity steppers on a second row to avoid horizontal clipping on small phones.

## Gates still open for genuine checkout

1. Durable orders, atomic stock reservations with expiry and idempotent checkout initiation under serializable concurrency, including full release/reconciliation for failed payments.
2. Provider-certified Hubtel/other marketplace collections, signed callback verification, multi-currency accounting, refund handling, audit events, and no fake payment success.
3. Seller fulfilment and delivery, delivery partners, inventory decrement on verified shipment/collection, proof of delivery, returns and disputes.
4. Seller KYC/eligibility, regional policy, live provider testing and safe buyer notifications.
5. Real-browser and Android/iOS two-device testing against active seller SKUs, price/stock races, denial of access to drafts, and delivery fee/tax computation.

**No changes to the existing VPS production database schema, payment configuration, current live web release, or mobile release are authorized by this code increment alone.** Exact-head CI and verified release pipelines are required first.
