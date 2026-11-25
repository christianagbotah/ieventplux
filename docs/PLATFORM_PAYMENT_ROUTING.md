# Unified payment routing — migration contract (planning only)

All purchase purposes share server-resolved purpose, beneficiary, gross minor units, currency, immutable fee snapshot and provider reference. No new seller wallet or manual collect-then-transfer fallback. The pure routing contract does not invoke providers or change existing payment routes.

| Purpose | Target model | Current gap |
| --- | --- | --- |
| Ticket / paid event access | Provider split with organization beneficiary | Existing Order and PaymentAttempt use Hubtel; ledger has organizer_payable; migrate only new certified purchases |
| Event souvenir | Provider split with actual authorized seller or organizer | EventSouvenirProduct catalogue is separate; resolve merchant identity and reservations |
| Marketplace goods / services / digital goods | Provider split with verified store beneficiary | Existing purchase request is nonbinding; checkout remains disabled |
| Paid voting / fundraising | Separate beneficiary split, subject to provider and regulatory approval | Do not enable without specific approval |
| Subscription / premium / SMS package | Direct platform revenue | Existing subscription invoice checkout must retain paid callback entitlement checks; no seller commission |
| Event/store/product boost or sponsored post | Direct platform advertising payment | Existing PromotionCampaign event-only and bills organizer_payable; new campaigns must use paid campaign-specific budget, not seller proceeds |

The initial contract supports Ghana cedis, gross commission already snapshotted by the source module, one beneficiary per purchase, and zero-value flows with no provider call. Multi-seller baskets require provider-certified multi-split or separate merchant checkouts. Event souvenirs with a separate seller must use a seller-specific verified recipient model before activation; no automatic assumption that event organizer owns every item.

Migration sequencing:
1. Maintain legacy payment attempts, payable liabilities, payouts, refunds and audit history; never reclassify historical transactions silently.
2. Generalize verified recipient registry to organizations and stores; keep test and live account identifiers separate. Sandbox verification is not live approval.
3. Introduce payment intent snapshot with unique purpose/source identity, gross shares, provider fee allocation and explicit settlement lifecycle. Require verified callback plus independent provider confirmation; exact amount/currency/recipient reference and idempotent fulfillment.
4. Implement adapter capability selection per country, purpose and channel. Do not fall back to custody if split unavailable.
5. Platform services require payment confirmation before entitlement/advertising activation. For prepaid ads, allocate budget to a named campaign only, track actual spend and refund unused budget under published terms. Never claim an unspent prepayment is already earned revenue; no general-purpose seller wallet.
6. Migrate new orders under per-purpose feature flags only after sandbox and reconciliation tests; preserve existing flows until approved transition. Review legacy outstanding organizer payable liabilities before retiring payout functionality.
7. Test refunds, chargebacks, duplicate callbacks, partial failure, campaign budget and recipient mismatch; prove actual provider settlement, not merely a successful checkout. No live charging in this branch.

## Immutable planning record

`PlatformPaymentIntent` now stores one planning snapshot per purpose/source purchase, with unique reference, exact gross shares, beneficiary, pricing-version identifier and SHA-256 equality fingerprint. The service accepts server-derived inputs only and rejects changed snapshots on replay. It does not start payment, confirm settlement, create entitlements, or replace historic PaymentAttempt rows. The additive SQL migration constrains records to PLANNED until a separately reviewed state-machine migration. Mixed-recipient souvenir purchases must be separated; event souvenirs may point to their own verified store beneficiary when authorized by the source module.
