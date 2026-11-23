# iEventPlux — Global events, creators, competitions, social, stores and real-time commerce

## North star

A 24/7 event-driven social and commerce network, not a ticketing website
with disconnected feature plug-ins. Each person or verified organization has
one identity and can act as attendee, supporter, creator, organizer, seller,
advertiser and customer, subject to explicit access and compliance gates.
Web and native Android/iOS use the same services, events, IDs and policy.

## Existing foundations that must be reused

- Event discovery, organizer KYC, event programmes, lineup artists/guests,
  short-video reels and following feed.
- Live video/LiveKit meetings, event discussion, event attendee networking,
  audience Q&A, interactive live polls and WebSocket event rooms.
- Event souvenir catalogue with SKU, price in integer minor units and stock
  reserved/sold/fulfilled counters, event orders and payment attempts.
- Payment provider transaction callbacks, append-only accounting/ledger,
  reservations, ticket issuance, refund case flow, Hubtel where configured.
- Moderation/reporting, user blocks, audit events, segmented permissions.
- React web portal and existing Expo/React Native mobile source sharing APIs.

## First increment in this branch: Awards and competitions

Supported formats include beauty pageants (e.g., Ghana's Most Beautiful-style
events), music awards, talent searches, dance competitions, best performance,
fan-favorite selections, charity awards and community recognition. Generic
categories/nominees permit multiple rounds or parallel competitions per event.

- Organizer with event:edit creates a DRAFT competition and up to 12
  award categories; each has 2–24 distinct nominees, maximum 150 total.
- Per-competition voting window, public results modes LIVE, AFTER_CLOSE
  and HIDDEN; draft and private event visibility enforced server side.
- Organizers can amend nominee names, short bios, HTTPS photos, category
  names and dates while DRAFT, or delete unvoted drafts. Opening a contest
  permanently locks its nomination/category content; closing does not unlock
  it. All edits happen in serializable database transactions.
- Organizer explicitly opens and closes each competition.
- Signed-in supporters may cast one FREE vote per category. Database UNIQUE
  (categoryId,userId) guarantees no duplicate free ballots on concurrent
  requests. Serializable PostgreSQL transaction checks the competition,
  category, nominee and opening window before insertion.
- Live updates use room event:{eventId}, with only identifier/type deltas;
  hidden tallies are NEVER broadcast. Clients refetch from authoritative DB.
- Audited create/edit/delete/open/close and successful vote operations.
- Web event page: multi-category draft editor, nomination cards, precise
  vote-confirmation dialog, live/reveal privacy and responsive layouts.
- Expo Android/iOS app: real native nominee voting screen using the same
  API, participant self-vote states and themed confirmation dialog.
- CI-only synthetic test checks draft privacy, organizer authorization,
  concurrent duplicate ballots, delayed public results, immutable nominees
  and cleanup against an isolated PostgreSQL service.
- Public free vote totals are withheld unless policy allows them, but each
  signed-in supporter can see their own selected nominee.
- Paid votes, vote bundles, MoMo/other payment initiation, real-money
  counting, refunds, SMS charging, platform fees and prize distribution are
  NOT enabled by this increment. They require additional settlement work.

## Paid supporter voting — nonnegotiable money gates

Before exposing a Buy Votes button:
1. An organizer-specific paid-voting agreement (rules, regions, pricing,
   cap per supporter, minors policies, transparency and refunds).
2. Immutable signed quote in integer minor units for package x unit price
   and currency. Idempotency key persisted before provider redirect.
3. Payment attempt state: INITIATED -> PENDING -> VERIFIED_SETTLED; failed,
   cancelled, expired and refunded are distinct terminal states. Do not count
   a pending payment, callback without verified signature, or redirect alone.
4. Exactly-once awarding of vote units from verified provider settlement,
   with unique provider-reference constraints and replay-safe callbacks.
5. Refund/reversal keeps immutable audit history; public counts use net
   settled votes and clearly disclose any changes after reversal.
6. User and device abuse signals, rate limits, fraud review, age/minor
   considerations, payout and tax reconciliation, organiser disputes,
   official voting terms and independent audit exports.
7. Results freeze and certified tally snapshots for finalists and awards;
   organizer cannot silently edit nomination or vote counts after opening.
8. Jurisdiction-specific review for contests, consumer protection,
   payment services and privacy before enabling paid fan voting.

## Universal creator/business store

Stores are independent from an event: a person can create a brand store or
an organization can own many stores. A seller's products can ALSO be linked
to events, live streams, reels and sponsored posts, but remain purchasable
24/7 even when an event ends.

Proposed model (not yet migrated):
- MarketplaceStore: owner user/org, slug, visibility, verification state,
  address/geo delivery zones, policies, contacts, logo/cover/social pages,
  payout enrollment, commerce permissions and staff roles.
- StoreCollection: categories, display order and merchandising rules.
- MarketplaceProduct: merchant-defined type GOODS | DIGITAL | SERVICE,
  name, description, SEO, brand, specifications JSON, dimensions/weight,
  media gallery, currency and tax category, return policy, publication state.
- ProductVariant: option values e.g. size/color, SKU and barcode, price,
  currency, weight, inventory policy, active state. SKUs unique per store.
- StockLocation, InventoryBalance, InventoryMovement and Reservation:
  changes append-only, never allow negative available units, atomic reserve
  with expiry, paid/order captures only after settlement.
- CheckoutSession + SellerOrder + OrderLine, accounting and fulfillment:
  multi-merchant cart split per seller/shipping/payment policy; stock
  reserved at checkout, confirmed only on verified settlement.
- SellerShipment: pickup/delivery/courier/dispatch, tracking events,
  partial fulfillment, proof of delivery, damaged/lost/failed delivery,
  digital item redemption and customer status notifications.
- Returns and refund cases with approvals, partial amount, restock decision,
  reverse ledger entries, provider refund references and buyer protection.
- Service orders with bookable time slots/capacity rather than pretending
  service inventory is a physical product.
- Reviews restricted to verified buyers; seller moderation and dispute path.

## Social feed, realtime engagement and ad marketplace

- Unified home/Following/Live/Event/Shop feed, with durable publication,
  user-safe recommendation and consistent creator identities.
- Posts: text, short video, photo galleries, clips, reels and live streams;
  comments, reactions, shares, follows, save/watch-later, tags, moderation.
- Creator monetization via subscriptions, ticketing, tips, verified
  sponsored posts, product affiliate links and live shopping; no automatic
  advertiser access to private conversations or attendee rosters.
- Merchant promotion campaigns: targeting by broad optional interests and
  geographic area, per-day caps, transparent sponsor labeling, impression/
  click dedupe, suspicious traffic filtering, consent/opt-out controls and
  budget ledger; no sensitive inferences or opaque pay-to-win ranking.
- Live-event synchronized modules: in-stream Q&A, contests, candidate
  highlights, moderated chat, audience reactions, product shelves and
  checkout status. Durable state in Postgres; realtime socket only pushes
  invalidation events; never rely on socket for money settlement.
- Search/discovery: multilingual tags, city/timezone-aware events, verified
  creator pages, products and business services, feed accessibility and
  fast low-bandwidth fallbacks.
- Anti-abuse: content moderation, age safety, seller verification, fraud
  rate limits, report/block/mute, appeal flow and human oversight.
- Strong privacy: opt-in attendee networking, no raw user/contact exports to
  sellers or advertisers, clear sponsored disclosures and data retention.

## Transaction workflow non-negotiables

Browser/mobile performs quote -> reserve -> payment attempt -> provider
callback verified server-side -> ledger entry -> order confirmed -> seller
pick-pack-dispatch -> delivery/POD -> completed or return/refund. Payment
redirect is NOT evidence of payment. No internal wallet without legal and
operational approvals. Shipment changes cannot fabricate stock or revenue.

## Product/engineering sequencing

1. Stabilize meeting camera/microphone and device-to-device calls on standalone
   Android/iOS; maintain the staging web release and add responsive parity.
2. Ship award competitions/free voting, privacy, audit and genuine realtime.
3. Build generic seller store with catalogue/variants, inventory and seller
   staff roles, independent of organizer souvenir management.
4. Connect multi-seller checkout to existing verified payment/ledger flow;
   add delivery, tracking, partial shipments, returns, disputes.
5. Introduce organic social feeds, creators, ad campaigns and live shopping
   progressively with moderator and payout controls.
6. Certify paid competition votes with reconciliation, signature verification,
   fraud review, refunds and published voting rules.
7. Stress test: concurrent ballots, order stock contention, huge live-event
   audiences and millions of feed consumers; SFU clusters for large meetings.
   Unlimited accounts/rooms means horizontal scalability, not pretending
   a single video server supports limitless simultaneous video tracks.

## Release gates for this branch

- Generated Prisma schema validated, additive SQL reviewed independently.
- No destructive migration; back up and verify DB before staging application.
- Source typecheck, unit tests, lint, web production build and CI green.
- Private events do not disclose nominees; drafts organizer-only.
- Repeated votes return conflict, invalid category/nominee rejected.
- Realtime outage does not corrupt tallies; count hidden until reveal policy.
- Real staging test with two distinct entitled accounts after migration.
- New frontend MUST NOT deploy before the additive DB schema exists.

This document is an architecture and rollout contract, not a claim that every
marketplace/social/paid-voting feature has already shipped.

## Database rollout

An additive SQL DDL is recorded in ops/migrations/20261123_awards_competitions.sql.
It adds four tables and their constraints without dropping any existing data.
Never apply the frontend before the DB upgrade. On the authorized staging
server, first make a recoverable PostgreSQL backup, check schema drift, apply
the reviewed DDL exactly once, validate constraints and build the matching
Prisma client. Then use an isolated versioned Next.js release and rollback
gates. Do not run prisma db push --accept-data-loss on a live database as a
substitute for reviewing this SQL migration.
