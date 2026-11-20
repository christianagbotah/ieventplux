# iEventPlux Event Operations: Lineups, Programme, Souvenirs

**Date:** 19 November 2026  
**Product intent:** A complete organiser-operated event experience with artist lineups, guest speakers, speaker topics, programme files, merchandise, and trustworthy QR workflows. Build incrementally without making unsupported payment, stock or entry promises.

## Release A — Current implementation

### 1. Performer, guest and speaker lineup

- Per-event profiles with confirmed full/stage name, role (`ARTIST`, `HEADLINER`, `MAIN_SPEAKER`, `ASSISTANT_SPEAKER`, `GUEST_SPEAKER`, `SPECIAL_GUEST`, `PANELIST`, `MC`, `DJ`, `HOST`), topic or performance description, biography, portrait, and optional start/end time and display order.
- Org-scoped create/read/update/remove endpoints at `/api/v1/events/{id}/contributors`. Editing requires event-edit permission. Draft/private access follows existing event visibility. Public detail only shows published profiles.
- The organizer editor lets organizers capture, review and revise person profiles. Public event detail shows each person's name, role, speaking topic or set, biography and time without guessing missing facts.
- Existing timed agenda stays a separate representation, allowing multiple people to appear in one programme item.

### 2. Programme outline PDF

- Organizers with `media:manage` permission can upload bounded programme PDFs (up to 10MB) through `POST /api/v1/uploads` with `kind=PROGRAMME`, `eventId` and a filename/title. MIME, PDF magic header and end marker are validated before storage.
- The PDF is stored in the **durable absolute** `IEVENTPLUX_UPLOADS_DIR`, not inside `.next` release files. A `MediaAsset` of kind `PROGRAMME` records the document. Programme PDFs are **not** served by the anonymous image route.
- The event page and the editor provide links to `/api/v1/events/{id}/programmes/{assetId}`. The download checks published status, accepted organizer membership or approved invite-only RSVP/ticket access. Responses are sandboxed, `nosniff`, no-store PDFs. An organizer can archive a programme link; records remain for audit.

### 3. Souvenir catalogue (read-only sales mode)

- Organizers configure items and explicit variants (e.g. T-shirt, size M, black) with unique event SKU, optional image, description, integer price in pesewas, finite stock, active state and sorting.
- Backend validates SKU uniqueness, integer price and inventory bounds. Stock cannot be lowered below sold/reserved quantity, and products are deactivated rather than being deleted.
- The event page can **display** the catalogue and the organizer can manage it, but `onlineOrderingEnabled: false` remains explicit until verified payment/stock/collection workflows exist.
- There is deliberately **no** merch checkout or receipt generation in this release. Presenting merchandise as purchasable while receipt fulfilment is unsupported would be misleading and financially risky.

## Release B — Paid merchandise and collections (pending)

Design and implement as a separate end-to-end financial release, with tests before live money:

1. Add `MerchandiseOrderItem`/`MerchandiseReservation` linked to the **existing authenticated Order and PaymentAttempt** model. One checkout may include tickets + souvenirs, or merchandise alone; always snapshot unit price, SKU, size and quantity.
2. Use a single, transactionally consistent reservation path to claim ticket seats and merchandise stock. A pending order holds inventory for a bounded window; expiry and verified payment apply exact idempotent effects. Do not sell the final available T-shirt twice across devices.
3. Issue receipt/order reference only after the payment provider confirms money server-to-server. Reconcile callbacks, timeouts, refunds, partial fulfilment, cancellations and chargebacks against immutable financial ledger entries. Do not assume browser return equals payment.
4. Assign a separate `CollectionEntitlement` to each paid souvenir line. Distinguish `UNPAID`, `READY`, `PARTIALLY_COLLECTED`, `COLLECTED`, `CANCELLED`, `REFUNDED` and `EXCEPTION_REVIEW`, supporting per-variant and partial-quantity delivery with an auditable issuer/scanner.
5. Organizer fulfillment dashboard by event, product, size/colour and pickup booth, with reserved/sold/uncollected/collected counts, order lookup, printable receipt and exports.
6. Issue cryptographically signed, short-lived or revocable **HTTPS** QR links designed for ordinary smartphone camera apps (not solely internal scanner payloads). The link opens the event's secure staff verification screen, not public order PII. Unauthenticated users must sign in; unapproved users see a denial, not the receipt or buyer details.
7. Separate authorized **Review → Confirm admission** from **Review → Confirm souvenir collection**. Same transaction may have two entitlements; ticket check-in must never automatically release a souvenir. Staff actions are explicit, idempotent, transactional and auditable, with duplicate/used/cancelled/refunded states.
8. Test camera-link opening on mainstream Android/iOS devices, offline check-in conflict resolution, payment refunds, one-use QR replay, webhooks and staff roles before enabling real-money merchandise sales.

## Production and migration policy

- Schema change is limited to creating `EventContributor` and `EventSouvenirProduct` tables with event foreign keys, indexes and one `(eventId, sku)` uniqueness constraint. File: `db/migrations/20261119_event_lineup_souvenir_catalogue.sql`.
- The initial live-schema comparison also revealed a pre-existing drift on the KYC job timestamp default. This unrelated change was deliberately removed from the event-operations migration.
- Rehearse migration on a clean schema-only clone of production; do not copy customer records into test.
- Before applying to production, verify a fresh recoverable database backup. Apply the additive SQL within a transaction, check indexes/constraints and database health. Do not run `prisma db push --accept-data-loss` or automatically roll back a live database.
- A code rollback is safe as the two unused tables do not change existing order or ticket columns; leave those tables intact during rollback.

## Acceptance gates

- Policy tests for malformed roles, photos, time windows, prices, duplicate SKUs and impossible stock reductions.
- Prisma validation, TypeScript, lint, isolated optimized build and authenticated API authorization smoke tests, plus public event view/visibility.
- Programme document permission tests, signed-out access checks, absent file handling and upload type/size tests.
- Mobile review of the new organizer editor and public lineup/catalogue at narrow widths remains a manual sign-off gate.
- Real payment, merchandise QR collection and final enterprise feature completeness **remain outstanding** until Release B and subsequent roadmap phases pass their gates.

### Release B expiry-sweep accounting note (20 November 2026)

The expiry worker must increment its returned `released` count and queue an order for expiry only **after** the corresponding PostgreSQL transaction commits. A transaction callback can return successfully while COMMIT still fails (e.g. a serialization conflict). Counters maintained inside the callback would incorrectly report released inventory and could trigger a follow-up order transition after rollback. Both ticket and merchandise hold paths now record success only after `$transaction` resolves. This is defensive accounting, **not** a substitute for isolated PostgreSQL concurrency and late-payment tests; keep charging and collection disabled.

### Release B expiry consistency guard (20 November 2026)

The bounded expiry worker must not transition an order to `EXPIRED` while any ticket reservation or souvenir hold remains `ACTIVE`. The final order transition now conditionally requires both sets of active holds to be empty, alongside the existing payment-success and order-status checks. This avoids marking partially released mixed orders expired when the 500-line sweep limit is reached. PostgreSQL concurrency, late-provider-payment, and end-to-end refund testing remain required before activating merchandise checkout or pickup.

### 20 November: duplicate successful payment review idempotency

The fulfilment exception branch now serializes duplicate-success handling per order with a PostgreSQL transaction advisory lock and checks for an existing system refund case keyed by the excess payment attempt. A replay must not create another manual refund case or resend a review notification. This does **not** initiate a provider refund, and it does not establish production readiness. Acceptance still requires two simultaneous callbacks for the same attempt, two distinct successful attempts, a refunded-order race, and provider reconciliation on an isolated staging database. Charging and physical collection remain disabled.

### Release B expiry recovery (20 November 2026)

The bounded reservation sweep now also scans up to 500 overdue, unpaid orders with no active ticket or souvenir holds. This recovers stale orders whose last stock hold was released in a previous sweep but whose order-status transition was interrupted. Final `EXPIRED` updates still recheck payment success, status and absence of active holds atomically. This is not a substitute for isolated PostgreSQL concurrency, late-payment and refund reconciliation acceptance tests; merchandise checkout and pickup remain disabled.

### 20 November 2026 — Isolated concurrency QA extension

The isolated `scripts/merchandise-isolated-qa.ts` harness now includes two concurrent checkout attempts for the final unit of a synthetic SKU. It asserts exactly one accepted reservation, one rejected attempt, one active hold, and unchanged sold stock. The harness refuses to run unless `DATABASE_URL` selects `schema=ieventplux_merch_qa_20261119` and the isolated checkout flag is enabled. This is **not** a substitute for provider-backed payment/refund QA or a production activation gate. Run against a freshly migrated scratch schema and record the result before claiming database concurrency acceptance.

### 20 November 2026 — concurrent payment replay QA coverage

The isolated merchandise QA harness now issues two simultaneous fulfilment replays after the synthetic order has been paid, asserting both return `ALREADY_PAID`, exactly one paid invoice and one consumed merchandise line, and no ticket entitlement. This test must still be executed against a migrated isolated PostgreSQL schema; it does not validate real provider webhooks, signatures, reconciliation, or refunds. Live merchandise charging and handover remain disabled.
