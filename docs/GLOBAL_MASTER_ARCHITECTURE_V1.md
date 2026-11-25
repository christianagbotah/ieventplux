# iEventPlux — Global Product Vision & Master Architecture
Version 1.0 | 25 November 2026 | Lightworld Technologies Ltd.


## 1. Executive decision & north star
One identity and a trusted network for everyday activities, commerce, opportunities and real-world services.

iEventPlux should evolve from event discovery and management into an AI-powered, global social and commercial ecosystem. It connects people, communities, creators, organizers, businesses and verified service providers. The objective is meaningful daily utility, not another passive content feed or an indiscriminate collection of features.

> Product promise: Discover what is happening; connect with people; find work, products and services; move safely; access verified help; and grow a business — within one coherent application.

### What makes this different

- TikTok-style content discovery can lead to events, shops, bookings and creator opportunities; Facebook-style communities can lead to real-world activities and trusted services.
- Eventbrite-style ticketing, Shopify-style stores, WhatsApp-style communication and LinkedIn-style networking become connected journeys, not isolated clones.
- A local taxi, a trotro operator, a carpenter, a water tanker company or a specialist hospital can become discoverable through the same verified service and location infrastructure.
- Ghana-first operations, international architecture: multiple countries, languages, currencies, timezones and regulatory policies from inception.
### Investment thesis

Start with high-frequency, high-trust needs that reinforce existing event and commerce adoption. The expanded local-services and transport network is a promising daily-use wedge; healthcare access is a valuable public-interest product with stricter safety and privacy controls. Validate product-market fit in concentrated communities before opening additional cities and countries.

### Status and authority

This is a proposed master development baseline, not a declaration of production readiness or a valuation forecast. New names are working divisions under iEventPlux. Maintain one canonical requirements register, architecture decisions and measurable acceptance gates. Update this version when commercial, legal or technical validation changes the design.


## 2. Market opportunity & competitive position
Evidence supports mobile-first utility, but adoption depends on trust, local density and service reliability.


| Indicator | Observed evidence / significance |
| --- | --- |
| Ghana mobile internet | 30.5 million subscriptions in Q2 2026; subscriptions are not unique persons. NCA dashboard [1]. |
| Ghana social media | 10.4 million active user identities in October 2026; identities are not necessarily unique users. DataReportal [2]. |
| Global connectivity | ITU estimates 6.3 billion internet users in 2026, while affordability and access gaps persist [3]. |
| Mobile money | GSMA reports more than US$2 trillion in worldwide mobile money transactions in 2025 [4]. |

### Ghana-first problem hypotheses to validate

- Fragmented discovery: people often rely on personal contacts, roadside searching, station visits, social posts and calls to find transport, artisans, facilities and suppliers.
- Underused service capacity: drivers and other providers may wait for jobs while nearby customers cannot discover them. Make demand visible without promising income or availability.
- SMEs need trusted storefronts, affordable promotion, appointments, quotation tools, payments and delivery coordination.
- Local languages, inconsistent addressing, expensive data and intermittent connectivity require voice, landmarks, low-data interfaces and honest last-known availability.
### How to win against incumbents

Compete on connected experiences, proximity and verified fulfillment rather than price wars or feature count. Benchmark TikTok, Facebook, WhatsApp, Eventbrite, Shopify, LinkedIn, Bolt and Uber, as well as local transport unions, marketplaces and directories. Conduct field interviews and track conversion, supply response, repeat use, complaints and unit economics.


## 3. Current project maturity
Repository and staging assessment from 25 November 2026. Status reflects implementation and CI, not full operational certification.


| Area | Verified / reported maturity |
| --- | --- |
| Events, discovery, ticketing, admission | Advanced implemented foundations: event management, inventory, QR tickets, schedules, check-in and public discovery. |
| Social, reels, messaging, meetings | Foundation implemented; real device acceptance, communications and load validation remain necessary. |
| Live broadcasting, AI and KYC | Partial; external provider configuration, verification and quality checks pending. |
| Competitions | Free voting implemented; paid voting and regulated mechanics not certified. |
| Marketplace and merchandise | Stores, catalogue and requests. PR #107 web/native request workflow passed CI, not deployed at time of review. |
| Payments | Centralized sandbox architecture and certification lab deployed; real provider testing and live split fulfillment remain gated. |
| Ticket allocation | PR #106 merged, main CI green; shadow allocation integration, not provider cutover. |
| Mobile & hosting | 20 native screens observed. PostgreSQL, web, worker and realtime services; staging healthy. VPS disk ~93% during review. |

### Existing assets to preserve

Reuse Next.js, TypeScript, React Native/Expo, PostgreSQL, existing authentication, organization membership, event inventory, outbox, notifications, audit, Hubtel/simulator legacy flows and the Paystack sandbox split architecture. Verify all current state again before merging or deploying. Do not rewrite stable modules solely to implement the new vision.

> Reference: github.com/christianagbotah/ieventplux and ieventplux.lightworldtech.com. No credible overall completion percentage until the expanded scope and acceptance criteria are baselined.


## 4. Product map & user identity
Proposed product divisions are internal domain boundaries; the public app remains one iEventPlux experience.


| Division | Core purpose |
| --- | --- |
| PluxNow | Nearby discovery, local radar, search and personalized daily plans. |
| PluxAI | Personal concierge, approved agents, translation and business intelligence. |
| PluxConnect | Social graph, content, communities, messaging and collaboration. |
| PluxEvents / PluxLive | Physical, virtual and hybrid events, meetings, ticketing and broadcast. |
| PluxMarket / PluxBusiness | Commerce, bookings, quotations, advertising, inventory and CRM. |
| PluxOpportunity / PluxCreator | Employment, skills, professional opportunities and creator income. |
| PluxCommunity | Associations, churches, schools, family and diaspora spaces. |
| PluxMove | On-demand mobility, taxi, station fleets, buses and trip coordination. |
| PluxServices | Artisans, home services, local jobs and essential service dispatch. |
| PluxUtilities | Water, sanitation, waste, licensed commercial logistics and supplies. |
| PluxCare | Verified healthcare discovery, appointments and facility communication. |

### One identity, multiple workspaces

A person can be an attendee, creator, passenger, merchant, driver, artisan and customer. Organizations can operate stores, fleets, clinics, events or communities with staff permissions. Verification attaches to the relevant person, organization, credential and service capability; a verified identity does not automatically license every activity.


## 5. PluxNow: everyday discovery
The home experience should answer “What is happening near me?” and “What can I accomplish today?”

Ask / browse voice or text → Discover map or list → Compare trust + price → Act book or contact → Return history

### Discovery and retention

- Nearby activities, concerts, church services, conferences, workshops, family events, football viewing gatherings, festivals, job fairs, volunteering, deals and local announcements.
- Interactive map and list, geographic filters, remote participation, accessibility, free/paid, time windows, distance and meaningful interest recommendations.
- Universal service search: “I need a taxi now”, “find a carpenter tomorrow”, “who supplies water to this area?”, “which facility offers maternity appointments?”
- Location permission is optional. Allow community, town, landmark and digital address entry. Cache recent public results with timestamps; never claim stale availability is live.
- Personal calendars, reminders, local subscriptions, saved searches and permission-based proximity alerts; user-controlled frequency and notification preferences.
### Global relevance

A Kumasi family can find affordable weekend activities; a London resident can find Ghanaian cultural festivals; a diaspora member in Canada can participate in a hometown meeting; a visitor can find verified providers without relying solely on personal contacts. Rank according to relevance, distance, availability freshness, quality and accessibility; clearly separate sponsored results.

> North-star experience: a user opens the app even with no event to attend, because it helps solve an immediate or recurring everyday problem.


## 6. PluxAI: intelligence across every division
AI helps people discover, prepare, communicate and act — but the authoritative database, provider and user approvals govern consequential actions.


| AI capability | Proposed behavior |
| --- | --- |
| Personal concierge | Intent and location-aware search; compare real listings, availability, costs and options. |
| Event architect | Editable agenda, venue, budget, ticket tiers, marketing and supplier plan from organizer brief. |
| Seller assistant | Voice or photos to draft product listings, specs, stock setup, store content and translations. |
| Business intelligence | Sales, customer demand, stock insights and forecast only with validated data. |
| Meeting and media AI | Consent-based transcription, minutes, action items, captions, translation, highlights and editing. |
| Opportunity matching | Skills, jobs, professional connections, training and mentor discovery with consent. |
| Trust and support | Flag scams and spam for review; grounded support from approved policies and knowledge. |
| Service and care navigation | Find matching verified capabilities; no diagnosis, medical triage decisions or guarantees of provider availability. |

Example: “Plan a gospel concert in Accra for 2,000 people.” The assistant proposes a structured draft, approved supplier shortlist and editable budget. A merchant can dictate stock and descriptions in Twi or Ewe. A passenger can ask for a taxi without typing a complex form.

### Agent controls

Use a provider-independent AI gateway, permission-scoped tools, retrieval with citations, cost budgets, quality evaluation per language, moderation and audit. Obtain explicit user confirmation before public posts, bookings, messages, financial actions, legal commitments or sensitive-data disclosure. Never fabricate jobs, facility services, availability, prices or medical expertise.


## 7. PluxConnect & PluxCreator
Social engagement should produce meaningful connections and sustainable income, not just screen time.

### Social and collaboration

- Personal/professional/creator/business profiles; posts, images, stories, reels, audio, articles and follows; public/private groups and interest circles.
- Direct and group messaging, voice notes, calls, shared calendars, tasks, documents and moderated discussion. Watch parties and collaboratively organized activities.
- Professional networking, opt-in introductions, portfolios, creator discovery and recommendation controls. Content can link to real events, products, services and community activities.
- Creator studio: scheduled publishing, analytics, editing, accessibility captions, media kits, sponsorship campaigns, AI highlights and music/copyright controls.
### Creator monetization

- Paid workshops, memberships, exclusive licensed content, merchandise, appointments, sponsored posts, brand partnerships, performances and affiliate commissions.
- Supported tips and digital access subject to payment provider, store billing and local policy. Earnings statements distinguish pending collection, confirmed settlement, refunds, fees and tax.
- Talent discovery for musicians, designers, comedians, dancers, presenters and performers. Opt-in portfolios, verified bookings and transparent referral economics.
### Trust and ranking

Feed relevance must avoid fabricated engagement. Label advertising and affiliate incentives. Provide chronological or following alternatives, mute/block/report, comment controls and child safety. Avoid pay-for-fake-views economics. Respect copyright and media consent; use community moderation, appeals and human review.


## 8. PluxEvents: complete event operating system
Retain events as the anchor of the ecosystem and make every event an entry point to commerce, transport, community and content.

- Public, unlisted and invitation-only events; categories, schedules, venue maps, accessibility, multilingual event details, recurring templates and event series.
- Artists, invited guests, speaker topics, programme PDFs, floor/zone and seat maps; registration, free RSVP, paid/group/early-bird tickets and waitlists.
- Inventory reservation, immutable pricing, verified payment, QR admission, replay-safe offline scanning, receipts, refunds and customer support.
- Souvenir catalogue, sizes/variants, preorders, paid inventory reservation, QR pickup and fulfillment evidence, delivery option. Current non-binding requests must not masquerade as paid orders.
- Award events, talent shows and fan voting: one free vote with replay protection; paid votes require independent legal and provider approval, transparent tally and reversal rules.
- Organizer workspace: KYC, staff roles, venue and logistics, budget, vendor quotes, marketing, sponsor packages, CRM, attendee analytics, reconciliation, incident response.
### Event-day cross-domain journeys

Discover event → Buy / RSVP ticket → Arrange transport → Attend QR or live → Shop / follow after event

Example: An organizer in Accra needs a 45-seat bus for a festival in the Volta Region, branded shirts, a sound engineer and ambulance standby. The event workspace issues separate scoped requests to verified transport, merchandise, technical service and licensed medical partners, preserving quote, booking and payment boundaries.


## 9. PluxLive: meetings and broadcast
A native, web and low-bandwidth communication experience suitable for small groups and large public audiences.


| Experience | Required functionality |
| --- | --- |
| Meetings | Scheduling, invitations, camera/mic permission, screen sharing, recording consent, host moderation and breakout rooms. |
| Webinars / hybrid | Registration, presenters, multiple stages, lounges, Q&A, polls and audience roles. |
| Entertainment / worship | Concerts, performances, church services, interactive broadcasts and replay. |
| Training | Live classrooms, resources, quizzes, attendance and moderated discussion. |
| Multilingual access | Consent-based captions, translation, interpretation, transcripts and audio-only alternatives. |
| Creator production | Noise reduction, approved AI clip generation, subtitles, replay search and rights management. |

Separate interactive meetings from broadcast architecture. Use WebRTC/LiveKit SFU for interactive rooms, adaptive streaming and CDN fan-out for large audiences. No arbitrary product ceiling should replace capacity planning; disclose operational limits, degrade gracefully and add regional infrastructure after load tests.

### Quality and protection

Native safe-area and permissions acceptance on physical Android/iOS devices; accessible controls; connection status, reconnect and network switching; role-checked signed join grants; recordings off by default unless approved; retention policies and private links. External streaming providers and AI speech services remain disabled until certified.


## 10. PluxMarket: AI-powered social commerce
An independent storefront that can also appear in event pages, live streams, reels and community discovery.


| Offering | Scope |
| --- | --- |
| Physical goods | Categories, variants, SKU/barcodes, gallery, specs, stock, inventory locations, checkout, pickup/delivery and refunds. |
| Bookable services | Service areas, time slots, quote requests, appointments, staff assignment, change/cancellation and completion. |
| Digital products | Licensed courses, music, templates, ebooks and content entitlements; app-store billing policy. |
| Live shopping | Demonstrations with pinned products, real availability, offer expiry and moderated chat. |
| B2B and wholesale | Bulk quantities, tier pricing, RFQs, supplier matching, approval, purchase order and invoice. |
| Negotiable / group buys | Merchant-approved offer or threshold, expiry, clear pricing and refund rules; no speculative wallet. |

Stores must have selectable categories including Other; country and region selectors, city, street/digital address, service area and GPS. Upload featured and gallery images, capture item-specific details, optional specs, stock and delivery parameters. Goods, services and digital products must use appropriate fields rather than forcing identical forms.

### Fulfillment and consumer protection

Order lifecycle from quote to immutable price, reservation, payment, packing, dispatch, delivery or pickup, proof, return/refund, settlement and reconciliation. Verified reviews only for eligible interactions; dispute support; explicit delivery cost, taxes and policy before payment. Merchant can prefer MoMo/card/cash as supported; payment preferences do not themselves certify a payout account.


## 11. PluxMove: everyday transport
NEW — unlock idle transport capacity and make local drivers and fleets discoverable by nearby customers.

The founder identified a practical Ghanaian problem: taxi and trotro drivers may wait at stations for passengers while nearby residents, event organizers or visitors struggle to find vehicles. iEventPlux can digitize existing transport networks alongside conventional ride-hailing, without forcing every operator into a single tariff model.


| Transport type | Primary service mode |
| --- | --- |
| Taxi / licensed private-hire | Immediate nearby pickup; scheduled booking; optional estimated or negotiated fare. |
| Trotro / minibuses | Station and route directories, departure status, seat enquiries, prebooking where operators support it. |
| Motorcycle / tricycle / boboya | Passenger or goods services only where permitted for vehicle and route; local safety gates. |
| Bus, coach and van | Whole-vehicle charter, group/event trips, school/company shuttles and intercity booking. |
| Rental, accessible vehicles | Verified rental providers, wheelchair-friendly filters, driver included/without-driver distinctions. |
| Recovery and cargo | Roadside towing, breakdown help and goods transport; separate from medical emergency response. |

### Provider onboarding

Register driver or fleet, verified identity, vehicle registration, class, license, roadworthiness, insurance, capacity, base station, service area, accepted trip types, pricing options, dispatch contacts and available hours. Validate permits with relevant authorities; DVLA service information supports document requirements [5]. Renewals, suspension and incident reporting must be built in.

> Do not assume every motorbike or tricycle is lawful for commercial passenger carriage. Enable only after legal, permit, insurance and operational review by jurisdiction.


## 12. PluxMove: dispatch, station & charter workflows
NEW — design flexible contact and dispatch, not only automated ride-hailing.

Request pickup + need → Match nearby available → Quote fixed or negotiate → Accept one provider → Trip proof + support

### Immediate taxi and local rides

- User enters pickup, destination, passengers, luggage, accessibility and urgency; GPS only with permission, with map pin, digital address or landmark alternative.
- List/map shows verified provider, vehicle type, capacity, approximate distance, availability timestamp, estimated pickup (only where calculated), rating and price or “request quote”.
- Notify eligible available providers in controlled widening radius; driver can accept/decline, propose price, or initiate in-app chat or voice call. No silent acceptance or exact home location exposure to unrelated users.
- Lock one accepted booking, disclose price and terms, pickup PIN, status and consented trip sharing; rider and driver can report unsafe behavior, cancellation or non-arrival.
### Stations, route groups and event charter

Station managers and transport unions can register fleet queues, common routes, licensed vehicles and duty schedules. Optional driver-entered departure/seat counts remain timestamped estimates until confirmed. A requester posts a group charter: pickup, destination, dates, passenger count, accessibility and luggage. Multiple fleet providers quote; organizer compares, approves one, records deposit/final payment only through certified provider flows and receives trip manifest and contact details.

### Night-time availability and safety

Drivers can mark available from home or a station with expiry and quiet hours. Show approximate service availability, never public home coordinates. Use consent-based location heartbeat, freshness thresholds and auto-offline. Do not claim drivers are awake, available or dispatched until they respond. No matching result triggers widen search, scheduled request or official emergency guidance as appropriate.


## 13. PluxServices: local work & skilled trades
NEW — a unified service-provider directory, booking and quotation engine for individuals, informal workers and companies.


| Category | Examples |
| --- | --- |
| Home and property | Carpenters, plumbers, electricians, painters, cleaners, masons, roofing, appliance repair. |
| Personal services | Barbers, salons, makeup, tailoring, laundry, tutoring and home support where lawful. |
| Events and business | Catering, decorators, sound/lighting, MCs, photographers, security, venues and equipment rental. |
| Automotive & roadside | Mechanics, tyre repairs, battery services, tow trucks and authorized recovery providers. |
| Agriculture & equipment | Farm services, equipment hire, logistics, storage and professional supply requests. |
| Professional services | Consultants, IT support, legal/accounting professionals, licensed specialist services. |

### Provider profile and booking

A provider selects service categories, skills, qualifications, community, service radius, location consent, portfolio/photos, languages, availability, hours, call-out fees, price list or quotation-only option, delivery/service terms and preferred contact. Credential requirements vary by service. Offer guided voice registration and optional station/association verification.

### Three ways to get help

- Browse a verified directory and contact a provider directly.
- Post a request for quotation with photos, quantity, location zone, timing and budget; compare itemized offers.
- Book an available slot or request immediate help; provider accepts, user confirms scope and amount; track status and completion evidence.
Use one reusable service taxonomy, provider profile, availability model, quotation and booking engine for PluxMove, PluxServices and PluxUtilities, with domain-specific extensions and permissions. No universal commission assumption: configure per category and commercial agreement.


## 14. PluxUtilities: essential services & logistics
NEW — make water, sanitation, waste and business supplies discoverable with reliable capacity and lawful operations.


| Service | Proposed workflow and safeguards |
| --- | --- |
| Water tankers | Choose volume, potable/non-potable requirement, location, source and delivery time; verify provider permits and water quality claims. |
| Waste / “Borla” collection | Household/commercial waste, recurring pickups, bulky items, collection quotes, lawful disposal evidence and permits. |
| Septic / toilet waste | Licensed vacuum truck or desludging company; service area, capacity, access requirements, appointment, receipt and authorized disposal. |
| Fuel supply / tanker B2B | Verified filling stations, licensed distributors and transport companies; approved RFQ, purchase order, vehicle and facility credentials, delivery documents. |
| Other essential logistics | Approved building materials, bulk goods, equipment, moving and authorized commercial deliveries. |

### Fuel is a restricted commercial capability

Fuel transportation and downstream commercial activities are licensed in Ghana by the National Petroleum Authority [6]. Do not create an open peer-to-peer fuel marketplace, public hazardous-cargo tracking or unrestricted private tanker booking. Use verified licensed B2B accounts, compliance review, approved product/capacity categories, documented contracts, insurance and authorized delivery. No operational instructions for handling hazardous materials in the app.

### Operational controls

Scheduled and on-demand service, service radius, vehicle capacity, quote with unit and volume, proof of delivery/collection, incident escalation, recurring contracts and invoices. Validate environmental and sanitation permits with relevant local authorities. Keep water for drinking distinct from non-potable water. Require proof before quality, source or disposal claims appear as verified.


## 15. PluxCare: verified healthcare directory
NEW — help people discover appropriate licensed facilities and professionals, book appointments and communicate securely.

Healthcare access is a meaningful extension, especially for someone new to a town or unaware of nearby specialist facilities. It requires a separate regulated domain: a public directory is not a medical record system, an appointment request is not clinical advice, and a listed facility is not a guarantee of available care.


| Public directory | Facility-managed scheduling |
| --- | --- |
| Licensed hospitals, clinics, maternity centers, laboratories and approved specialties. | Departments, supported services, opening hours, appointment types, facility contacts and accessibility. |
| Verified locations, address, landmarks, directions and supported insurance/NHIS information with freshness dates. | Clinician name and specialty only with authorized public profile and credential verification; schedule slots from facility. |
| Service categories including maternity, dental, eye care, diagnostics, surgery consultations and specialist clinics. | Actual clinician/department availability, clinic rota, appointment request/acceptance, cancellation, reminders and waitlist. |
| Indicative consultation or procedure fees, inclusions, source and update date; direct confirmation required. | Secure patient-to-facility communication; clinician messaging only after approved relationship and facility workflow. |

### Verification

Verify facilities through Ghana’s Health Facilities Regulatory Agency (HeFRA) licensing process [7] and doctors/dentists through the Medical and Dental Council register [8]. Other health professions require the appropriate authority. Track credential source, issue/expiry dates, last check and restrictions. Do not assume regulators offer an API; use authorized integrations or manual checks.


## 16. PluxCare: appointments, privacy & urgent needs
NEW — healthcare scheduling and emergency signposting must be safe even when availability is incomplete.

Search service / facility → Compare verified details → Request slot / contact → Confirm facility accepts → Attend secure follow-up

### Appointments and clinician workflow

- Facility administrator adds approved departments, practitioners and weekly/monthly rota, schedule exceptions, appointment duration, location and consultation fee. Public view exposes bookable slots, not private staff rosters or unrestricted personal numbers.
- Patient requests a slot; backend atomically holds/claims it with expiry and capacity control. Facility or assigned practitioner confirms; patient receives acknowledgement, time, location and reminder. Reschedule/cancel, waitlist and no-show handling.
- Conversation is private, auditable and role-scoped to authorized care staff. Minimize clinical content; do not store records, diagnosis, prescriptions, lab results or telemedicine until clinical governance, security and consent requirements are met.
- For surgery, maternity or specialist treatment, display only facility-published estimates or consultation prices with inclusions and “confirm with provider”; no automated treatment selection or cost guarantee.
### Emergency example: unexpected labour at night

> In Ghana, the National Ambulance Service directs medical emergencies to 112 [9]. In a suspected emergency or urgent childbirth complication, show a prominent official emergency call action immediately. Never delay emergency care while comparing taxis, prices or appointment slots.

Ordinary transport may be useful for non-emergency journeys only when appropriate. Do not classify a taxi as an ambulance or dispatch unlicensed medical transport. A later certified integration could connect official emergency services, event ambulance standby or licensed non-emergency patient transport; no promise of dispatch without an actual confirmed partner.

Sensitive health searches and appointments are never used for ad targeting. Isolate healthcare data and access logs; use encryption, restricted staff access, consent and legally reviewed retention. No public exposure of patient identity, home address or health condition. AI is a directory navigator, not a clinician.


## 17. Opportunity, community & learning
Create reasons for individuals and entire organizations to return throughout the week.


| Division | Daily-use features |
| --- | --- |
| PluxOpportunity | Verified jobs, internships, apprenticeships, freelance assignments, portfolios, employer profiles, work alerts, job fairs and professional networking. |
| Learning | Courses, live workshops, mentoring, quizzes, skill assessments, approved institution-issued certificates and learning communities. |
| Business opportunities | Exhibitions, supplier RFQs, grant listings, competitions, partnership opportunities and investment events with clear source/advertising labels. |
| Churches & associations | Services, member groups, meetings, programmes, committees, membership cards and privacy-controlled directories. |
| Schools & alumni | Campus clubs, seminars, reunions, conferences and career opportunities. |
| Local & diaspora | Festivals, town associations, development projects, volunteer activities, family gatherings and hybrid meetings. |

Community workspace: role-based membership, announcements, recurring calendars, documents, surveys, committees, shared tasks, volunteer coordination and authorized fundraising with reporting. Avoid creating a public list of private memberships. Allow family and faith groups to opt out of discovery.

### Additional ideas to validate

Lost-and-found, neighborhood notices, accessibility-friendly service directory, equipment sharing/rentals, digital business cards, event volunteer marketplace and recurring household services. These should use existing domain primitives and moderation rather than create disconnected applications. Jobs and grants must not promise employment or funding; verify listings and report scams.


## 18. PluxBusiness: growth tools & suppliers
One professional workspace for merchants, organizers, service providers, creators, fleets and approved institutions.

- CRM and consented communications; customer history, loyalty, feedback and referrals. Distinguish marketing consent from transactional notifications.
- Organizer command desk: event funnel, real sales, attendance, capacity, vendor tasks, ticket inventory, refund and payout reconciliation.
- Merchant operations: product/service management, orders, appointments, staff roles, stock, fulfillment, delivery, return cases, invoices, cash and digital accounting.
- Service-provider and fleet dashboards: availability, job dispatch, route/booking calendar, quote history, compliance renewals, completed services, expenses and earnings.
- Sponsorship and supplier marketplace: venues, caterers, decorators, sound engineers, photographers, transport, security and approved standby health services. Compare offers and approve purchases within event budgets.
- Advertising manager: boost events, shops, products, creators or eligible services. Target broad location/interests, budget, scheduling, frequency cap, verified billing and reports. Never target sensitive healthcare or protected attributes.
### Professional growth tools

Branded event microsites, configurable business templates, multi-branch operations, sponsor/exhibitor leads with consent, professional analytics, exports and APIs. AI suggests improvements from real records and clearly labels estimates. All financial reports distinguish GMV, actual platform revenue, processing fees, refunds, chargebacks and settled balances.


## 19. Shared service directory, geo & dispatch model
Design once, reuse across mobility, artisans, utilities, commerce, suppliers and authorized healthcare navigation.


| Entity / contract | Responsibilities |
| --- | --- |
| ProviderProfile / ServiceListing | Person or organization, category, capabilities, price policy, coverage, verified status, listing lifecycle. |
| Credential / Vehicle / Fleet | Scoped licenses, insurance, expiry, issuer, capacity, station/route membership, review audit. |
| ServiceArea / LocationSample | Country/region/community, geofence, optional precise coordinates, timestamp, permission and accuracy. |
| Availability / Slot | Available, busy, offline, paused, expired; schedule rules, capacity, exceptions and version. |
| ServiceRequest / Quote | Intent, type, time, scope, approximate area, constraints, price snapshot, expiry and revision history. |
| Booking / Assignment | One accepted provider/slot, lifecycle, permissions, cancellation and disputes; no double allocation. |
| Trip / Delivery / Proof | Domain-specific progress, consented location, PIN/QR proof, incident and completion. |
| HealthFacility / Practitioner | Separate sensitive access, verified service catalogue, appointment slots and facility relationship. |

### Search and dispatch contract

Use PostGIS geographic indexes and bounding queries, route/ETA estimates from a mapping provider when available, capability and freshness filters, opt-in radius expansion and fair match ranking. Distinguish straight-line distance from route distance. Clients must handle no results, inaccurate GPS, unreachable network, rejected requests and stale data. Reject unauthorized exact location queries and cross-tenant access.


## 20. Commerce & centralized payment architecture
One orchestration layer, distinct settlement rules and auditable fulfillment for every domain.

Authoritative quote / order → Immutable payment intent → Licensed PSP checkout → Verify collection → Fulfill / settle reconcile


| Payment purpose | Routing decision |
| --- | --- |
| Tickets, souvenirs, goods, services, paid access and eligible voting/fundraising | Provider-directed split with verified beneficiary and configured commission; enable only per certified purpose and jurisdiction. |
| Mobility, charter, artisan and utilities | Approved service booking / quote; provider split or approved cash workflow. Cash fees invoiced separately; no pretend settlement. |
| Subscriptions, boosts, sponsored posts, premium features, SMS | Platform-direct revenue; no fictitious merchant share. Campaign budgets, actual spend and refunds tracked separately. |
| Clinical / regulated services | Facility-directed collection only if legally and commercially approved; avoid fee-sharing or referral models until reviewed. |
| Digital goods and access inside native app | App Store / Google Play billing or permitted alternatives per category and market [11,12]. |

> Illustrative 10% commission: ₵100.00 gross purchase = ₵10.00 platform + ₵90.00 beneficiary before applicable provider fees and taxes. Actual configured commission and fee-bearer govern each order; not a universal rate.

Use licensed providers under Ghana’s Payment Systems and Services Act framework [10]. Keep direct provider settlement, no unlicensed custody or generic internal wallet. Idempotent attempts, raw signed callbacks, independent verification, immutable ledgers, refunds/chargebacks, allocation evidence, settlement records and reconciliation. Preserve historical obligations. Test keys and live credentials are isolated, sandbox cannot fulfill real purchases.


## 21. Technical architecture & international scale
Preserve the existing modular monolith; extract services only where throughput, latency, reliability or team ownership justifies it.

Clients web / native / lite → API gateway identity + policy → Domains typed services → Async outbox + realtime → Data / media regional infra


| Layer | Recommended baseline / expansion |
| --- | --- |
| Experience | Next.js / TypeScript web; React Native / Expo Android and iOS; PWA/lite. Shared UI tokens, schema, API contract and accessibility. |
| Domain services | Events/tickets; social; marketplace; bookings; dispatch; utilities; care; opportunities; community; AI; advertising; trust. Versioned REST/OpenAPI, service interfaces. |
| Data | PostgreSQL transactional truth; PostGIS geo; pgvector when justified; Redis-compatible cache; OpenSearch when search volume demands. |
| Async / live | Durable transactional outbox, workers, idempotent consumers, scalable queues; socket realtime; WebRTC/SFU and adaptive streaming/CDN. |
| Media / AI | S3-compatible object storage, image/video transcode, moderation pipeline; multi-provider AI gateway with evaluation and quotas. |
| Infrastructure | CDN, TLS, encrypted backups, observability/OpenTelemetry, regional clusters, autoscaling and disaster recovery as measured demand requires. |

### Data and service boundaries

Global IDs, tenant isolation, ISO currency with integer minor units, IANA timezone and locale, location normalization, policy registry by country and capability. Healthcare privacy boundary and financial ledger boundary are separate from general social graph. Avoid duplicate business entities and avoid distributed transactions where local atomic operations suffice.


## 22. Reliability, security & acceptance architecture
Build correct state transitions, safe failure and verifiable release gates before operating at scale.


| Domain | Critical acceptance criteria |
| --- | --- |
| Orders and bookings | Concurrency cannot oversell inventory or double-book vehicle/clinician slots; prices cannot change after acceptance; retry does not duplicate. |
| Provider availability | Expired heartbeat not ranked as live; exact location only shared with authorized accepted parties; location permission off still supports manual search. |
| Payments | Test/live isolation; forged or replayed callback rejected; verified amount/currency/recipient; no fulfillment before approved verification; refund reconciliation. |
| Care and safety | Emergency call shortcut always visible in urgent context; no taxi-as-ambulance; no unverified clinical credentials; appointment data inaccessible cross-tenant. |
| Media & social | Private rooms and content authorization, reporting/blocking, recording consent, abuse load and moderation; real device acceptance. |
| Operations | Dependency health, backups and tested restore, safe rollback, load tests, error budgets, alerts, versioned releases, minimal VPS retention. |

### Engineering discipline

Use domain state machines, explicit transition authorization, SQL constraints, optimistic concurrency/row locks, immutable audit events, feature flags, synthetic fixtures, authenticated integration and end-to-end tests. CI: typecheck/lint, web/native tests, production build, migration dry-run, artifact hash and release provenance. Stage on existing environment; never deploy unverified or claim readiness based on unit tests alone.

Initial proposed targets to validate with real load: p95 ordinary search/API under 1 second where network permits; high-priority booking notifications delivered quickly under normal conditions; 99.9% core pilot uptime target; recovery objectives determined by business impact. No service-level guarantee before measurement.


## 23. Trust, safety, law & governance
Trust is an operating system, not merely a verification badge. Apply rules to the specific provider, transaction and jurisdiction.

- Privacy and consent: Ghana Data Protection Commission registration and appropriate data processing controls [13]; international rules assessed before expansion. Minimize sensitive data, encrypt, limit access, log use, support correction/deletion/export and define retention.
- Transport: driver/vehicle license, roadworthiness, insurance, permits, route authority, passenger safety, incident reporting and local rules. Verify through authorized channels; no assumption that every class can carry passengers.
- Health: facility and professional verification, secure communication, no unauthorized clinical practice, no sensitive targeting; emergency numbers by jurisdiction, authoritative clinical oversight.
- Utilities: local sanitation, waste, water quality and environmental requirements; licensed NPA fuel actors only. No unrestricted hazardous logistics.
- Social: age-appropriate design, child safety, blocking/reporting, moderation and appeals, copyright, consent, spam and scam protection, transparent ads.
- Financial: approved PSP and settlement model, merchant verification, disputes, tax and consumer rights, anti-fraud and applicable AML controls. Jurisdiction-specific paid voting and fundraising review.
### Safety UX

No anonymous exact GPS browsing, background tracking by default, public patient information or unverified provider claims. In-app masked contact and consented call/chat, trip sharing, pickup verification, complaints, support escalation and privacy controls. Avoid fake ratings; distinguish verified bookings and independent reviews. Clear uncertainty, data freshness and accessible failure paths.


## 24. User experience & emerging-market access
One coherent brand, a modern mobile-first design system and low-friction everyday journeys.


| Navigation | Purpose |
| --- | --- |
| Home | PluxNow daily dashboard, AI search, nearby events, local services, opportunities and saved items. |
| Explore | Map/list discovery, filters, category hubs, live, shops, providers and facilities. |
| Create | Post, event, live, meeting, store, provider listing, request, community or opportunity. |
| Inbox | Chats, voice calls, booking updates, quotes, messages and notifications. |
| Profile | Identity, role/workspace switch, tickets, orders, appointments, bookings, payments, privacy and settings. |

### Ghana-first design standards

- Data-saving mode with adaptive media, thumbnails and audio-only streaming; offline cached tickets and safe sync. No promise of real-time dispatch while offline.
- English, Twi, Ewe, Ga, Hausa and French as initial proposed priorities, translation evaluation and fallback; voice navigation, accessible forms and guided onboarding.
- Country/region selectors, city, community, optional GPS/digital address/landmark, price in ₵ for Ghana and correct localized currency elsewhere.
- Native safe-area, independent desktop sidebar scroll, responsive grids, custom accessible dialogs, real status and immediate authoritative refresh after writes; no browser redirects for ordinary native screens.
### High-frequency shortcuts

Home can surface “Find a ride”, “Get a service”, “Find a health facility”, “What is on today?”, “Shop nearby”, “Jobs & skills”. Contextual dashboards prevent overcrowded menus. Show clear availability and last-update labels; place emergency access prominently where relevant, not behind a login or checkout.


## 25. Commercial model & unit economics
Diversify revenues, keep basic access useful, and validate the economics of each domain.


| Revenue stream | Model / guardrail |
| --- | --- |
| Event and marketplace sales | Configurable commission on verified settled transactions; refunds and fee-bearer transparent. |
| Service bookings and mobility | Commission, fleet or service SaaS, or approved listing fees; test viability with drivers and unions. |
| Organizer, merchant and creator plans | Premium workflows, CRM, inventory, analytics, production and enterprise features. |
| Advertising and sponsorship | Transparent sponsored posts, event/store/product boosts, sponsor marketplace, delivery and performance measurement. |
| AI, training and recruitment | Premium AI usage, course commission, employer tools and approved listings. |
| Virtual events / enterprise | Hosting packages, white-label portals, integrations, SMS packages and API access. |
| Utilities and healthcare | Contracted B2B platform subscriptions or approved service fees; no clinical referral or fuel fee model without review. |
| Delivery and logistics | Authorized partner referral or contracted fees with customer disclosure. |

Measure gross merchandise value separately from platform net revenue, provider fees, incentives, refunds and operating cost. Monitor cost per booking, cost per acquired active user, contribution margin, support burden, payment success and repeat use. Free basic discovery, ordinary social participation and access to official emergency information remain available.


## 26. Ghana-first launch & international growth
Market density matters more than total feature count. Launch deliberately and build international capability in parallel.

### Pilot and distribution

- Start with concentrated communities in Accra, Tema, Kumasi and selected regional towns. Recruit organizers, universities, churches, event promoters, wedding planners, SMEs and associations.
- Partner with transport stations, unions/fleet owners, artisans, licensed water and sanitation companies and verified facilities. Field-test provider registration and availability accuracy; obtain written commercial and compliance agreements.
- Use community events as acquisition: attendees follow organizers, join groups, arrange transport, buy products and book services. Local providers earn repeat demand; communities provide referrals.
- Pilot specific high-frequency verticals: verified taxi/charter enquiry, local artisan RFQs and event supplier bookings, followed by authorized utility services. Launch healthcare directory with verified facilities and emergency signposting; appointments only with actual facility integration.
### Expansion sequence

Ghana nationwide → diaspora communities and neighboring West Africa → broader African markets → international markets with actual demand and partners. Each new country has language/currency/timezone, map/address, emergency number, privacy, licensing, consumer rights, payment-provider, tax and app-store readiness gates.

### Growth loop

Organizers + providers → Useful content + services → Users + bookings → Trust + income repeat use → More supply network grows

Recruit verified supply before broad marketing; never fake listings or activity. Use shareable event links, provider QR profiles, offline-assisted onboarding and consented referrals. Provide dispute support and measure response quality, conversion and retention by city/category.


## 27. Master implementation roadmap
Design the complete architecture now; deliver in dependency order without abandoning core commitments.


| Wave | Deliverables and exit gate |
| --- | --- |
| 0 • Stabilize existing core | Merge verified ticket/merchandise updates, finish checkout/QR/refunds/settlement tests, mobile parity, backups, clean releases. Actual provider certification. |
| 1 • Shared provider discovery | Taxonomy, identity/credentials, service areas, geo search, availability freshness, directory + contact, request/quote engine. Pilot taxi, artisans and event suppliers. |
| 2 • Booking and dispatch | Atomic acceptance, scheduling, notifications, privacy-preserving maps, trip/booking lifecycle, station and bus-charter tools, proof and disputes. |
| 3 • Commerce and utilities | Paid orders/reservations, deliveries, returns, service payments, licensed water/waste and restricted B2B fuel partner pilots. |
| 4 • Healthcare access | Verified facility directory, official emergency links; facility-authorized schedules, booking and secure communication after privacy/clinical review. |
| 5 • Daily discovery & community | PluxNow, local radar, low-data UX, groups, jobs, learning, creator and supplier monetization, ads and CRM. |
| 6 • Advanced AI & international | Evaluated translation, permissioned agents, live shopping, scale tests, regional infrastructure, provider/country activation. |

### Parallel workstreams

Product/UX and native parity; backend/data/security; provider partnerships and legal; AI/media; infrastructure/QA; go-to-market and support. Each deliverable needs an owner, dependencies, acceptance test, release evidence and rollback. Do not enable regulated or external-provider capability before sign-off.


## 28. Measurement, release gates & risks
An evidence-led roadmap distinguishes delivered, deployed, certified and adopted capabilities.


| Metric / risk | Decision rule |
| --- | --- |
| North-star metric | Weekly unique users completing a meaningful activity: attended event, confirmed booking, completed purchase, useful learning or community action. |
| Service marketplace health | Search-to-request, provider response, request-to-booking, completed jobs, stale-availability rate, complaints, repeat use, earnings and geographic density. |
| Commerce and events | Checkout success, verified fulfillment, ticket admission, refund/dispute rate, seller retention, net revenue and contribution margin. |
| Healthcare access | Verified facility freshness, appointment confirmation, cancellation, privacy incidents, correct emergency signposting. Never optimize for clinical referrals. |
| Reliability / safety | p95 latency, failed requests, notification reliability, crash rates, abuse response, security incidents, backup restore and location leakage tests. |
| Risks | Feature sprawl, thin supply, misleading availability, expensive media, provider dependence, transport/health compliance, fraud and server capacity. |

### Mitigation and approval gates

Define city/category pilot baselines before growth targets. Use feature flags and rollback; certify payments using real sandbox evidence and authorized live pilot. Regulated launches require agreements, licensing and privacy review. Establish support staff and incident escalation. Existing VPS storage near 93%: avoid new redundant releases, retain active plus tested rollback, move media to approved external storage and monitor capacity.

> Market leadership is an aspiration, not a guarantee. Success requires trustworthy supply, reliable execution, adoption, partnerships, disciplined costs and customer satisfaction.


## 29. Source register & baseline governance
External evidence checked 25 November 2026. Product proposals and example journeys are recommendations, not claims of existing functionality.

[1] Ghana NCA, Telecom Industry Trends Dashboard, Q2 2026: https://statisticaldashboard.nca.org.gh/
[2] DataReportal, Digital 2027: Ghana, October 2026 data: https://datareportal.com/reports/digital-2027-ghana
[3] ITU, Facts and Figures 2026: https://www.itu.int/itu-d/reports/statistics/facts-figures-2026/
[4] GSMA, State of the Industry Report on Mobile Money 2026: https://www.gsma.com/sotir/
[5] DVLA Ghana, services and vehicle/driver documents: https://dvla.gov.gh/services
[6] National Petroleum Authority, licensing: https://npa.gov.gh/licensing/
[7] HeFRA, Licensing Directorate: https://hefra.gov.gh/licensing-directorate/
[8] Medical and Dental Council, practitioner register: https://www.mdc.gov.gh/register
[9] National Ambulance Service, emergency call 112: https://nas.gov.gh/
[10] Bank of Ghana, licensing and authorization of PSPs: https://www.bog.gov.gh/notice/licensing-and-authorisation-of-payment-service-providers/
[11] Apple App Review Guidelines (payments and UGC): https://developer.apple.com/app-store/review/guidelines/
[12] Google Play payments policy: https://support.google.com/googleplay/android-developer/answer/9858738?hl=en
[13] Ghana Data Protection Commission, registration portal: https://app.dpc.gov.gh/
### Internal references

iEventPlux strategic review and founder’s mobility, utility, trade and healthcare requirements, 25 November 2026. Repository status snapshot: PR #106 merged, #107 passed CI; staging active at e2972a5. Existing architecture docs: GLOBAL_PLATFORM_STRATEGY_20261120.md, GLOBAL_SOCIAL_COMMERCE_AND_COMPETITIONS_20261123.md, ENTERPRISE_GROWTH_BLUEPRINT_2027.md, ARCHITECTURE.md.


## 30. Architecture baseline & decision log
This master plan should be stored as the working reference and versioned as requirements become verified.

### Approved direction proposed for founder review

- Single iEventPlux brand, identity and shared services; retain stable implementation and grow incrementally.
- Transport, local services, essential utilities and healthcare access become first-class domain extensions with common search, availability, quote and booking foundations.
- Direct settlement via approved payment providers, distinct platform-direct revenue, no unlicensed custody.
- Ghana-first pilot with global locale, policy and scaling model; no universal launch of regulated services.
- Health directory and appointment system only; official emergency pathways, no diagnosis or ambulance substitution.
- Restricted licensed B2B fuel transport, not public hazardous-material marketplace.
### Open decisions to confirm before launch

Commercial partnerships and permits by service class; transport union model and fare/commission policy; water/waste quality and disposal verification; healthcare facility contracts, scope of appointment data and clinical governance; provider-certified payment and app-store policy; SLA, operational support capacity, data retention, localization quality and cost budgets.

### Change control and implementation rule

Maintain a requirement ID for each domain, owner, dependencies, design, API, database migration, test, deployment evidence, country feature flag and release note. Every release must preserve current user workflows, demonstrate native/web parity for the capability, and disclose pending external certification. Record architectural decisions with rationale, alternatives and reversal plan.

> The world of possibilities — Discover. Connect. Experience. Trade. Learn. Earn. Get help. Move. Build for meaningful outcomes, not feature count.
