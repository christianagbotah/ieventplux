# iEventPlux — Premium Product & Growth Blueprint

**Owner:** Lightworld Technologies Ltd.  
**Date:** 19 November 2026  
**Purpose:** Build an enduring, trusted event operating platform, not just a ticket-selling website. A multimillion-dollar business is a commercial objective, not a software feature or guaranteed valuation.

## 1. Product positioning and competitive evidence

- **Local advantage:** Ghana-first Mobile Money checkout, cedi pricing, event-market distribution, venue pins and all 16 Ghana regions; add Twi/Ewe/French/English content and low-bandwidth access as consented products, not hard-coded assumptions.
- **Creator growth:** Eventbrite ships AI-assisted event creation, marketing, organizer check-in and attendee lifecycle tools. Benchmark: https://www.eventbrite.com/organizer/features/all-features/
- **Enterprise accounts:** Cvent's AI attendee companion, B2B networking, measurable exhibitor leads and CRM integration set a higher bar than ticketing. Benchmark: https://www.cvent.com/en/platform and https://www.cvent.com/en/press-release/cvent-unveils-more-70-product-innovations-cvent-connect-2026-backed-1-billion
- **Agent-assisted operations:** Bizzabo announced approval-gated event agents in October 2026. Avoid unchecked autonomous billing, refunds, payments or event edits. Benchmark: https://www.bizzabo.com/blog/bizzabo-reveals-its-agentic-operating-system-for-events
- **Local competitors:** eGotickets has partner distribution and Ghana-focused event discovery. Competition requires trust and distribution, not simply adding a bigger menu. Benchmark: https://egotickets.com/organizers

## 2. User journeys to perfect

1. **Attendee:** Discover an event by city/date and interests; accurate ticket fees and availability; pay securely; receive tickets and reminders; access event-day maps, check-in, accessibility and support; post-event review and opt-in recommendations.
2. **Organizer:** Register the right individual/church/school/business profile; complete private KYC; build event in a guided editor; publish and market; manage ticket inventory, invitations, refunds and staff; settle payouts; understand actual event profitability.
3. **Venue/event operator:** Create geographically accurate venues and floor/zone plans; staff rostering, QR access tiers, controlled offline scanning, incident escalation and reconciliation.
4. **Sponsor/exhibitor:** Purchase verified event packages, administer booths and lead capture with opt-in, view explicit sponsor ROI; export CRM leads only with lawful consent.
5. **Platform staff:** Configurable moderation, tenant-aware security, payment reconciliation, audit events, provider status, incident workflows and support impersonation only via audited, time-bounded elevation.

## 3. Release-by-release investment priorities

### Release A — Shipped first foundation (commit in git history)

- Premium **Organizer Command Desk** and **Growth & AI** workspace with actionable, source-labelled operating signals based only on real event status, inventory, waitlist and valid tickets issued.
- Embedded AI copywriter in event editor: generates from user facts, previews and edits locally, explicit apply/undo, no automatic publication or price changes.
- Tighten organization finance permissions: the overview redacts sensitive finance/settlement amounts from check-in and event-management roles; Insights is finance-scoped.
- AI generation is organization-scoped and permission-checked; higher-cost poster generation has separate rate limits. Provider status checks SDK configuration without claiming a successful paid request.

### Release B — Ticketing, revenue and retention

- Documented enterprise sales funnel metrics: unique visitors, search-to-event views, checkout starts, successful payments, accepted tickets, attended tickets, refunds and repeat buyers, with explicit consent/retention.
- Abandoned-checkout recovery only after lawful messaging consent; campaign attribution IDs, UTM sources and conversion events; batch-safe event emails/SMS with unsubscribe and deliverability receipts.
- Event tier pricing, early-bird release schedules, group tickets, seated/zone tickets, waitlist conversion with idempotent reservation and expiry, dynamic fees with price history and approval.
- Corporate organizer team permissions and multi-branch administration; reusable templates, recurring events, brand assets and branded event microsites.

### Release C — AI-led event operations

- AI event builder: approved brief → structured draft (title, agenda, marketing, capacity and ticket tiers); organizer reviews each field before commit.
- Event knowledge assistant grounded in **organizer-approved** FAQs, venue guides, schedule, policies and live event updates. Cite document sections; never improvise refund policies or safety information.
- Explainable demand analysis and forecasting **only after** a meaningful historical dataset, calibration, holdout validation and monitoring exist. Show error bands, drift and confidence; never guarantee sales.
- Consent-led recommendations and networking; multilingual/localized customer support with human escalation and model quality evaluation by language.

### Release D — Enterprise revenue products

- Sponsor marketplace, exhibitor subscriptions, consented badge/lead capture, booth inventory, lead source attribution and sponsor reports.
- White-label / branded event apps, organizer subscription tiers, custom domains, venue seat maps, integrations (CRM, accounting, marketing), webhooks and APIs.
- Platform commissions, SaaS subscriptions and optional enterprise add-ons priced transparently; maintain separate ledger entries and avoid double charging.
- Data warehouse/BI ingestion, regional privacy controls, fraud analytics, audited AI agent review queues and scalable queue/event architectures.

## 4. Modern UX/UI operating standard

- **Design:** polished evergreen/neutral palette with restrained gold accents, clear 16–24px information hierarchy, 14–16px body text, compact 44px minimum mobile actions, no oversized sticky header.
- **Navigation:** always-independent sidebar and content scrolling on desktop; minimal mobile navigation, visible current location and short predictable forms.
- **Resilience:** optimistic CRUD updates followed by authoritative refresh, no success toast before server confirmation, errors describe how to recover, retry without wiping form state, no hidden stale UI.
- **Accessibility:** responsive 320–1440px layouts, keyboard and focus order, screen-reader labels, contrast/zoom checks, reduced-motion support, safe status announcements and dialog backdrops.
- **Trust:** mark live integrations vs configured vs unverified; show fees before checkout, payout ledger details and reasons for KYC or fraud review, never display mock success as real money.

## 5. Non-negotiable engineering gates

- **Payments:** Hubtel/other provider callback signatures, amount/currency validation, idempotency, charge verification, scheduled reconciliation, refund/chargeback handling and tested payout controls before live money scale.
- **Data protection:** Ghana Data Protection Act obligations, country-specific processor terms, retention, deletion rights, audit controls, role-aware access and separate biometric consent for Smile ID.
- **AI safety:** authorization and rate-limit every billable generation; no PII leakage into shared prompts; human approval before publishing, messaging, price changes or money movements; fallback must be labelled rule-based, not predictive AI.
- **Service quality:** performance budgets, anti-bot and rate controls, backup/restore drills, offline scan conflict resolution, real mobile acceptance, load and recovery drills, error monitoring and accessibility CI.

## 6. Metrics that determine business value

Track active/repeat organizers, published events per active organizer, 30/90-day organizer retention, paid GMV (₵), platform net revenue (₵), successful payments / initiated checkout, first-time / repeat buyers, refunds and chargebacks, lead-to-sponsor conversion, SaaS MRR and net retention. **GMV is not revenue; revenue is not profit.** Segment by country, organizer type and acquisition channel. Define baselines before setting growth targets.

## 7. Immediate acceptance criteria for Release A

- Non-finance staff cannot access finance totals from `/orgs/{id}/overview` or `/orgs/{id}/insights`; cross-tenant access rejected on `/orgs/{id}/growth`.
- Action priorities, inventory maths and active-waitlist counts are pure-testable and never claim a demand forecast.
- AI studio rejects users without event creation permission and requires a real organization membership; generated content never auto-publishes.
- Organizer dashboard clearly differentiates revenue from tickets and shows actual errors/retry states.
- TypeScript, lint, unit tests, isolated production build, authenticated workflow tests where safe and public health smoke pass before release.

**Not yet proven:** Real external AI output, provider live money flows, full mobile browser acceptance and valuation. These remain separate tests and commercial validation, not hidden product claims.

## Production AI activation status (19 November 2026)

The deployed environment explicitly sets `AI_CONCIERGE_ENABLED=false`. The embedded AI content writer checks provider-readiness and displays an unavailable/manual-edit state rather than claiming working AI generation. The Growth Center remains functional using real data and labelled rules. Before enabling model-backed output, confirm provider credentials, billing, response quality, AI safety tests and rate limits; do not silently remove the live feature gate.

### Release B incremental progress — Ticket sales controls (19 November 2026)

New/edit organizer ticket controls now expose sale opening/closing windows, paid group discounts and per-buyer limits; server validates dates, caps, and pricing; public event pages distinguish scheduled releases from sold-out inventory. See [TICKET_SALES_CONTROLS.md](TICKET_SALES_CONTROLS.md). Seat mapping and corporate package subscriptions are not part of this increment.
