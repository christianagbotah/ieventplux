# Ghana marketplace direct settlement (not activated)

Paystack Ghana documents single-seller split settlements and dynamic multi-seller splits:
- https://paystack.com/docs/v2/gh/payments/split-payments/single-split
- https://paystack.com/docs/v2/gh/payments/split-payments/multi-split

Lightworld is the main merchant; each seller is onboarded and verified as a provider-approved subaccount. No marketplace wallet, seller balance withdrawal or collect-then-transfer fallback. The pure settlement planner computes the gross commission in integer pesewas and a fixed Paystack transaction_charge. It performs no network requests. Default main account fee bearer is an example policy, not approved commercial terms. A 100 cedi order at 10% yields seller 90 and platform gross 10 before fees.

Before checkout activation:
- Obtain written provider approval for third-party marketplace merchants, seller KYC, bank subaccount settlement, whether direct MoMo settlement is supported, fee/refund/dispute responsibility and settlement timing. Do not infer MoMo subaccount support from buyer MoMo acceptance.
- Store only verified provider recipient IDs plus masked destination display; require reauthentication, verification and audit for payout destination changes.
- Separate order, payment, commission, provider settlement and refund records; immutable order price/commission snapshots; currency and amount verification; server-side merchant identity, no client-supplied subaccount or commission.
- Verify signed webhooks and transaction reference via provider API, enforce unique references and idempotency, reconcile actual fees and shares against provider settlements. Payment success does not mean settlement completed.
- Cash on delivery / pickup: if enabled, seller receives cash; platform commission is an invoice or prepaid subscription, never pretend cash was automatically split. External direct MoMo similarly cannot auto-deduct commission. Never collect full funds to Lightworld and manually distribute.
- Certify sandbox success, failure, replay, refund, chargeback, stock reservation, multi-store delivery, mobile UX and seller KYC before live enablement. No live keys or payment routes in this change.
- Store creation currently supports Ghana only, since catalogue prices and settlement policy are Ghana-specific. Extend country, currency, taxes and provider eligibility together.
- Public listing image uploads use existing persistent media path; images are reencoded and metadata removed. Add per-store storage quota and orphan garbage collection before broad rollout.
