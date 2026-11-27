# iEventPlux execution backlog

Maintain this file as the public, sanitized engineering checkpoint. Keep credentials, customer records, private infrastructure details and sensitive operational evidence outside GitHub. A merged feature is not equivalent to a deployed or accepted feature.

## Checkpoint — 2026-11-27
- Baseline: main 5973b8b; CI, source-light artifact workflow and Android QA artifact reported successful.
- Account verification, organizer profile, notifications, private messaging and calling pilot code have merged in integration PRs #136, #139, #140–#159 and #162. Confirm actual staging parity; do not infer delivery or external provider readiness from merge status.
- Current work: migration-role preflight, tested backup/restore readiness, coordinated web/worker/realtime release rehearsal.
- Next feature: review organizer recurring-event draft PR #164 and dependent series-edit PR #165; integrate only after security, scheduling and regression acceptance.
- Reconcile superseded draft PRs against integrated changes before closing; do not merge duplicate patches blindly.

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
