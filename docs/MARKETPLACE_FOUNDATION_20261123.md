# iEventPlux Marketplace: independent seller stores (foundation)

This increment adds always-on seller catalogs under `/#/shop` and seller studio at `/#/seller`. Stores are owned by accounts, optionally linked to an organization, and are **not dependent on a live event, ticket, or souvenir inventory**. The same APIs power native Android/iOS browsing and website browsing.

## Delivered in this increment

- Independently created seller stores with unique shareable slug, category, business description, website, city and optional branding image URLs. Draft/active lifecycle and explicit seller-verification state. Only email-verified account owners may publish; no unverified seller receives a verified badge.
- Responsive directory/search, public storefront page, seller studio, creation dialog, product management, product publication/archiving, and adjustments to physical inventory. The mobile app has independent store discovery and read-only product-detail screens (native selling tools are not yet implemented).
- Products with rich descriptions, brand, category, up to 30 specifications and ten HTTPS images; one to 24 unique SKUs with prices stored in integer minor units; configurable size/color/material options are supported via API. This first web editor accepts a list of SKUs and prices; richer variant-option editors are a further UI milestone.
- Product stock quantities and available-to-sell (on-hand minus reserved). Stock changes are whole-unit, seller-authenticated, append-only movements with reason, unique operation key, and database serializable transaction. Replayed identical operation keys are non-mutating; an operation key with changed details is rejected. No stock reductions below reserved units are accepted.
- Public API strips draft products, seller-private stock fields and records for unpublished stores; stock history is private to seller. App endpoints have request rate limits and explicit ownership checks.
- Programmatic validation covers URL/slug safety, specs/variants, stock constraints. GitHub CI runs synthetic integration tests against disposable PostgreSQL with separate seller/stranger sessions, catalogue publication, idempotency and cleanup.

## Not yet enabled

**No checkout or delivery order can be placed through these independent stores.** These screens explicitly mark checkout unavailable and never collect money or falsely represent an in-progress order as paid. Seller KYC, order payment settlement, stock reservation expiry/reversal, seller fulfilment, courier tracking, returns, refunds, promotions, ads, creator storefront monetization and multi-merchant cart are subsequent phases. Pre-existing event souvenirs retain their own independent order/payment workflows.

## Secure checkout and fulfilment gates

1. Buyer cart and immutable quote for each store, variant, quantity, rate, tax, delivery zone and currency, with inventory price/tax version checks.
2. Atomic Postgres reservation for stock (recheck quantity under concurrency) and reservation expiry/reconciliation worker; digital goods and services use separate entitlement/capacity mechanisms.
3. PaymentAttempt per seller order with unique reference, provider initiation, verified Hubtel status (never a return URL or unverified callback), exact amount check, idempotent provider event processing, accounting ledger and payment reconciliation.
4. Capture/confirm inventory only on verified settlement. Expired and failed payment attempts release reservations exactly once; late successful payments follow reviewed oversell/refund rules.
5. Shipment with pick-pack, address/phone validation, dispatch, courier assignment, tracking, delivery proof, partial order and returns; sellers cannot mark orders paid by direct API call.
6. Buyer protection, cancellations, partial refunds, damaged returns, taxes/fees and merchant payout/reconciliation; separate onboarding/compliance for seller financial payouts.
7. E2E tests for stock contention, double-click purchases, callback replays, seller scope isolation, payment failures, cancellations, delivery, refund, mobile screens, accessibility and verified real-device transactions.

## Migration/rollout

Additive migration `ops/migrations/20261123_marketplace_store_foundation.sql` creates MarketplaceStore, MarketplaceProduct, MarketplaceVariant, MarketplaceStockMovement and indexes/foreign keys without dropping existing schema. Validate backup and schema drift, run within a DB transaction, verify uniqueness/foreign keys, build a new isolated Next release, do local preview and API smoke, then switch staging with rollback on failed health checks. The production data must never be reset or seeded.

**Capacity:** Marketplace discovery and catalogue are currently basic paginated/limited read paths, not yet a globally scalable search/sharded catalog; large-scale ranking, full-text search, media CDN, caching, fraud detection, abuse moderation, compliance and observability have their own readiness gates. These are distinct from the secure base implementation.
