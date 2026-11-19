# Ticket Sales Controls — Organizer Guide and Release QA

This release adds organizer-facing configuration for ticket-sale windows, per-buyer limits, paid group discounts, and bounded inventory changes. Server-side checkout retains all pricing authority and re-checks the sale window.

## How to use

1. Open **Organizer Studio → Events**, then create an event or edit an existing one.
2. Existing ticket types now appear in the editor. Select **Manage** to change their name, quota, release window, group discount, or per-buyer limit.
3. For a new ticket type, enter the basic fields, expand **Schedule ticket sales or add a group discount**, and choose an optional **Sales open** and **Sales close** date/time.
4. To enable a group offer, choose its minimum quantity and percentage discount; the minimum quantity must be at least 2 and no greater than 10 or the per-buyer cap. Group offers require a paid ticket type.
5. Existing ticket price becomes immutable after sales. Lowering quota beneath sold/reserved seats is rejected. Capacity increases, including switching to unlimited, trigger waiting-list promotion workflows.
6. Publish the event once its content and ticket setup have been reviewed. Public event pages identify scheduled releases rather than mislabel them as sold out. A page left open refreshes the saleability clock every 30 seconds, and checkout independently enforces the schedule.

## Data integrity and documented limits

- Prices are integer minor units (pesewas), with a maximum ticket price of ₵1,000,000; `0` means a free ticket.
- Quotas must be nonnegative integers up to 1,000,000; `0` represents unlimited inventory.
- Maximum order quantity is currently **10** per ticket type; per-buyer limit is 1–10. Group quantity is 2–10 with a 1–90% discount. Group discounts apply to qualifying ticket-type lines, not to the full event order.
- Date/time inputs use the user's browser-local time and serialize as ISO timestamps for server comparison; users should ensure their device timezone matches their intended event sales timezone.
- Saved sales and prices do **not** rewrite previous order financial snapshots. Do not assume discounted pricing improves conversion until it can be measured against real data.
- This release does not implement mapped/numbered seat selection, tiered corporate packages, or live demand forecasting; these remain enterprise roadmap items.

## Acceptance gates

- Pure validation tests reject invalid timestamps, reversed dates, nonfinite prices/quota, incomplete group offers, unbuyable quantity thresholds, and discounts on free tickets.
- Typecheck and lint pass before build. Verify authenticated organizer create/edit flows, ticket sale time boundaries, checkout, and a human-observed mobile UI session in a dedicated staging environment before offering an enterprise guarantee.
- Never run paid-checkout or inventory-mutating golden-path smoke tests against real production customer data.

## Checkout concurrency hardening (2026-11-19)

- Checkout requires a signed-in user; anonymous guest checkout is not enabled. Quantity input is validated as a real integer (no silent rounding) and each ticket type may occur only once per order.
- Per-buyer caps are enforced while holding a PostgreSQL advisory transaction lock for the event and buyer; active unpaid reservations count until expiration, preventing overlapping checkout requests from bypassing limits.
- Ticket reservations use a single conditional PostgreSQL `UPDATE` which simultaneously checks the remaining quota, ticket activity, sales window and the quoted price/group policy. Concurrent requests cannot claim the same last ticket. Lines are processed in stable ticket-type order to reduce deadlocks.
- Organizer ticket settings use a row lock during quota and price edits. Unlimited → finite inventory is **not** treated as a capacity increase; prices become immutable after the first reservation/order even if issued tickets remain at zero.
- This change is backend-only and additive: no schema migration, pricing rewrite or live payment is required. A real authenticated staging transaction/reconciliation test is still necessary before claiming a fully verified ticket-selling release.

## Discount-code capacity and concurrent checkout (2026-11-19)

A checkout with an event promotion now locks the `DiscountCode` row inside the
same transaction that reserves ticket inventory, rechecks validity and price,
and counts pending unexpired orders plus confirmed redemptions against
`maxUses`. Different buyers cannot reserve the final promotion slot at once.
Expired or cancelled orders stop consuming a slot. The promotion lock is taken
after inventory locks to match fulfilment lock ordering. This does not itself
prove payment callback idempotency or a full end-to-end paid checkout; both
remain explicit integration acceptance gates.
