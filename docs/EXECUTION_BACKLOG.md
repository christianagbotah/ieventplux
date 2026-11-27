# iEventPlux execution backlog

Maintain this file as the public, sanitized engineering checkpoint. Keep credentials, customer records, private infrastructure details and sensitive operational evidence outside GitHub. A merged feature is not equivalent to a deployed or accepted feature.

## Checkpoint — 2026-11-27
- Baseline: ticket branding #169, shop verification #167 and mail relay/feedback #168 merged and staged; user confirmed email verification worked. External push delivery and real media acceptance remain separate.
- Runtime role preflight #166 merged; isolated regression verified normal application ownership, rejection of foreign-owned tables and superuser execution. Continue to use guard for each migration.
- Recurring event creation #164 and future series editing #165 merged; individual feature-branch CI and artifact checks passed. Combined main CI, artifact deployment and staging acceptance pending.
- Recurring event combined CI and runtime package passed; web deployed with API health checks, Android QA build pending installable release verification. Superseded #156/#157/#160 closed after source reconciliation.
- Live engagement #171, native engagement #173, award ballot integrity #174 and Android build catch-up #172 merged with feature-branch checks passing. Combined release and installable Android verification pending.
- Current: separate 30-minute marketplace stock hold pilot, atomic reserve/release/expiry, explicit gated UI and migration rehearsal. Do not enable before isolated regression, migration/worker deployment and staging acceptance. No order/payment settlement yet. Real-device push/calling and paid competitions remain pending.
- Keep marketplace checkout, settlement, awards voting, and provider integrations gated until their end-to-end acceptance tests pass.

## P0 — Runtime and release reliability
- [ ] Run runtime role preflight as application role before and after schema changes; rehearse on disposable PostgreSQL first.
- [ ] Review additive migration order, role ownership, constraints, defaults, indexes, rollback compatibility; test twice.
- [ ] Verify fresh backup checksums and perform isolated restore drill; certify offsite recovery separately.
- [ ] Verify CI-generated web, worker, realtime artifacts, source commit and manifest; rehearse all services together against a disposable database.
- [ ] Verify feature flags, authentication, public routes, realtime authentication and worker queues; deploy runtime artifacts only, preserve previous verified rollback.
- [ ] Verify staging health and feature acceptance; record commit, CI runs, tests, deployment and rollback evidence.
- [ ] Audit obsolete release/worktree/cache inventory; preserve unpushed work and active/rollback artifacts; remove only verified recoverable inactive copies.

## P0 — Identity, social activity and messaging
- [ ] Email verification: clickable entry, single-use expiring token, resend throttling, success/error states, native deep links; test verified/unverified sessions and provider configuration.
- [ ] Profile: owner-only edit, avatar/banner uploads, validation, private data access, responsive web/native parity.
- [ ] Follow, ticket order, marketplace request and message alerts: durable transaction/outbox, deduplication, recipient access, unread/read state, reconnect, pagination and retention.
- [ ] Push: session-bound device registration, opt-in permissions, token rotation, retry/receipt handling, logout revocation, foreground/background behavior; verify real device delivery separately.
- [ ] Private messages: text, voice, image/PDF, delivery retry, reporting, blocking and authorization; test cross-account isolation.
- [ ] Calls: incoming invitation, accept/decline/expiry, media entitlement, camera/mic permission, reconnect and cleanup; real Android/iOS and browser tests before wider enablement.

## P1 — Event organizer and attendee lifecycle
- [ ] Review recurring draft series creation, edit-future scope, timezone/DST, conflict detection, ownership and paid/published event protection.
- [ ] Organizer event editor: agenda, speakers, artists, guests, files, media, location, capacity, ticket types, promotions and merchandise.
- [ ] Attendee discovery: location, dates, search/sort/filter, accessible cards, RSVP, waitlist, ticket purchase, QR admission and receipt access.
- [ ] Group meetings: SFU admission, screen sharing, device permissions, moderation, reconnect and load tests; avoid unvalidated capacity claims.
- [ ] Awards/competitions: eligibility, vote integrity, audit, payments where applicable, organizer reporting and moderation.

## P1 — Commerce and services
- [ ] Store onboarding, branding, catalog/variants/specs, inventory/stock ledger, search and geographic discovery; responsive seller/buyer views.
- [ ] Cart, checkout, payments, order tracking, receipt/QR collection, delivery, refunds, reconciliation and seller settlement.
- [ ] Provider integrations: isolated sandbox verification, signed callbacks, idempotency, currency/fee routing, reconciliation and live certification gates.
- [ ] Service enquiries, appointment booking, provider credentials and service areas; transport vehicle/driver/route/departure/charter workflows.
- [ ] Admin approval, access control, abuse reporting and audit trails; prevent unverified commercial fulfillment.

## P1 — Native and web experience
- [ ] Consistent navigation and design tokens; compact forms, accessible typography, responsive layouts, professional dialogs, empty/loading/error states.
- [ ] Replace unnecessary web redirects with genuine native screens; retain documented secure fallback only where required.
- [ ] Verify Android installation and signed update path, version discovery, network recovery, phone/tablet and accessibility layout.
- [ ] Verify iOS build/signing, notification and media permissions, device tests; do not claim App Store readiness without evidence.
- [ ] Web/mobile end-to-end tests covering each vertical slice; desktop browser responsiveness and keyboard navigation.

## P2 — Platform expansion and operations
- [ ] Social feed, creator clips/reels, livestreaming, audience polls, community interaction and moderation.
- [ ] AI assistance: graceful provider errors, safety/privacy boundaries, accessibility and cost limits.
- [ ] Admin analytics, organizer insights, financial reporting, platform configuration and audit exports.
- [ ] Security and privacy review, rate limits, authorization, encryption, data retention and disaster recovery.
- [ ] Performance/load testing, observability, deployment documentation, operator runbooks, user onboarding and launch acceptance.

## Definition of done
Implement database/API/web/native changes as applicable; run focused and regression tests, CI, artifact packaging and staging acceptance. Record evidence and remaining blockers; then immediately select the next actionable task. Never equate a source merge with a successful deployment or a pilot with production certification.
