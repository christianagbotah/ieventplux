# iEventPlux — Global event-community platform

**Owner:** Lightworld Technologies Ltd.
**Product north star:** A global home for real-world and online moments, connecting
organizers, audiences, performers and local/global communities. We compete on
trusted events and participation rather than cloning general-purpose social apps.
A large valuation or market share is an ambition, never an engineering guarantee.

## Audience journeys

1. Anyone can browse public real events worldwide, discover what is happening
   today in their own timezone, search by organizer, region, topic, format or
   free/paid entry, and share event links.
2. Attendees can RSVP to free events, buy supported paid tickets, follow creators,
   collect tamper-resistant tickets, and join authorized livestreams/replays
   from compatible devices. No assumption that a stream provider or payment
   method is deployed until verification succeeds.
3. Organizers can manage identity and team permissions, publish public/unlisted
   events, lineups, venues, agendas, tickets, invitations, live sessions,
   souvenirs, orders, audiences, moderation, reconciliation and analytics.
4. Artists and event creators can showcase public clips, profiles and past/upcoming
   events; social interaction should prioritize safety, consent and value.

## Priority waves (not yet all complete)

**P0 — Trustworthy foundation:** account security, moderation/reporting, KYC,
provider verification, payment/refund ledger reconciliation, backups, accessibility,
low-data mobile, fraud/rate-limit gates, reliable free RSVP and digital tickets.
Integrations remain off until end-to-end, device and real-money checks pass.

**P1 — Worldwide discovery & attendance:** internationally inclusive home and
filters; browser-local Today/Week/Weekend across IANA timezones and DST; actual
country inventory; online/hybrid inclusion; case-insensitive cross-organizer search;
correct listing currency; explicit payment-country restrictions. This release
implements the discovery/visibility layer, NOT worldwide payment processing.

**P2 — Creator/community graph:** multilingual profiles, creator verification,
followers, interest graph, event clips, recommendations, privacy-respecting
notifications and strong abuse reporting. Feed ranking must distinguish
organic/sponsored posts and never manufacture engagement numbers.

**P3 — Online participation at scale:** signed join rights; low-latency
livestreams, recorded replays, moderated chat, multilingual captions/
interpretation, interactive polls, Q&A, reliable scheduling and paid access.
Use regional CDN/storage once provider agreements and costs are approved.

**P4 — Organizer operating system:** role-based event team, CRM, sponsors,
seat maps, inventory/pickups, accredited crew, payouts, analytics and partner
marketplace; enterprise-grade APIs and integrations.

**P5 — Regulated global commerce:** regional PSP adapters, ISO 4217 currency
snapshot per payable line/order, provider-presentment and settlement currency,
tax/VAT, country-specific consumer rights, payouts, refunds/disputes,
anti-money-laundering and data protection. Do NOT silently treat USD/EUR as GHS.
Current real checkout remains **GHS-only** until explicitly certified.

## 20 November 2026 first global discovery increment

- Public discovery gains dynamic country listings based on **existing** public
  upcoming events. No fabricated global inventory or IP geolocation.
- Attendee date queries use a validated IANA timezone with correct DST and
  Sunday-weekend behavior; browser timezone supplied on ordinary searches.
- Online-access filtering includes VIRTUAL and HYBRID; organizer/title/summary/
  description search becomes case-insensitive. Public privacy visibility is
  unchanged; invitation-only and unlisted events are never search results.
- Public cards show their ticket currency rather than assuming all values are
  Ghana cedis; mixed currencies are not combined into a misleading price.
- Paid checkout refuses unsupported currency, even if pricing changes during
  the stock reservation transaction; **free tickets** remain allowed in any
  country. No production migration is required for this increment.
- Unit tests cover local calendar windows, DST, regional filters, public-event
  visibility and money safety. CI gates all changes before production release.

## Definition of product success

Track verified organizer activation, weekly events published, discovery to
attendance conversion, free/paid attendance success by region, repeat
attendance, creator community retention, livestream completion, dispute rates,
fraud/abuse reports, incident response times and net revenue **without**
inventing active users, ticket sales, provider availability or revenue.

## Non-negotiables

GDPR/data rights, local privacy/security requirements, children and age-sensitive
events, content moderation and reports, copyright licenses, accessibility,
transparency of sponsored posts, event authenticity, transaction protections,
and operational support must be included before scale. Scale payments and
media through modular providers and real load testing, not promises.
