# iEventPlux — Requirements Traceability Matrix

Maps every requirement from the master build brief (§2–§24) to implementation code, screens, verification evidence and status. Statuses: **DONE** (implemented + verified), **PARTIAL** (implemented, limited by documented constraints), **BLOCKED** (externally blocked — credentials/contracts), **DEFERRED** (documented, not in this pass).

Verification evidence keys: `TEST_REPORT.md` sections E1–E14 (scripted browser/API checks), `LINT/TSC` (bun run lint / tsc --noEmit).

## §2 Product purpose & market

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Discover → connect → attend (physical/virtual) | `Discover.tsx`, `EventDetail.tsx`, `BroadcastView.tsx`, discovery API | DONE | E1, E6 |
| Churches/ministries/associations + concerts…workshops | Seed orgs/types, categories, event forms | DONE | E1 |
| International expansion design (countries, tz, phone, currency-aware) | `User.country/timezone/locale`, `Event.timezone` (IANA), money module ISO codes | DONE | DATA_MODEL |
| Ghana = initial payout market only; no worldwide settlement claims | Verification gate, `PROVIDER_CAPABILITIES.md` blocked payouts, UI copy | DONE | E11 |
| Free browsing; ticket + paid virtual revenue; commissions/subscriptions/promotions/streaming | All modules implemented | DONE | E2, E5 |

## §3 Architecture & engineering decisions

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| TS monorepo web/api/worker/contracts | Single Next.js app + API routes + `mini-services/worker` + `mobile/` (adapted; documented) | PARTIAL | ARCHITECTURE adaptations table |
| NestJS modular REST + OpenAPI | `/api/v1` modular routes + `/api/v1/openapi` | PARTIAL | E3 |
| Durable background workers | OutboxJob queue + worker :3001 (claim/lock/reclaim/retries→DEAD) | DONE | E7 |
| React Native mobile source | `mobile/` Expo scaffold (not device-tested) | PARTIAL | mobile/README |
| PostgreSQL+Prisma / Redis/BullMQ / S3 | Prisma on SQLite (portable schema); SQLite outbox; local uploads dir | PARTIAL | ARCHITECTURE |
| Managed video provider behind adapter | `env.videoProvider` adapter switch; Cloudflare Stream blocked → labelled synthetic renderer | PARTIAL | E6, PROVIDER_CAPABILITIES |
| Modular monolith, DB source of truth, no premature microservices | Yes — documented | DONE | ARCHITECTURE |
| Docs before implementation | docs/ suite (10 supporting + 4 core) | DONE | docs/ |

## §4 Accounts, organizations, isolation

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Register/login/logout, verified contacts, password reset, session revocation, profile edit, notif prefs | `/auth/*` routes, `AuthView`, `Me` | DONE | E4 |
| Real account recovery flow | code-based reset + global session revocation (dev exposes code with DEV label) | DONE | E4 |
| Org roles: owner/admin/event-manager/finance/check-in/analyst | `permissions.ts` matrix + team UI | DONE | E5 |
| Platform roles incl. finance admin/super admin | User.role + admin console gating | DONE | E11 |
| Stronger auth for privileged financial actions | `requireElevated` (10-min password re-check); refund processing enforces it | DONE | E9 |
| Shared users + org-scoped model; caller orgId never authorizes | `membershipFor` from session on every org route | DONE | E8 |
| Cross-org access denied | Server-side checks on attendees/orders/finance/streams | DONE | E8 |
| Public reads use publication/privacy rules | `PUBLIC_EVENT_WHERE` visibility filters | DONE | E10 |

## §5 Frontend quality & screens

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Mobile-first, accessible, loading/error/empty states | All views (skeletons, EmptyState, ARIA labels, focus rings, reduced-motion) | DONE | E1, E12 |
| Compact filters desktop / drawer mobile | `Discover` sticky filter bar + Sheet drawer | DONE | E1 |
| Search, pagination, tables, collapsible organizer sidebar | Discovery pagination, admin/organizer tables, collapsible sidebar | DONE | E5, E11 |
| Required public/attendee/organizer/admin experiences | All screens built (see README journeys) | DONE | E1–E12 |
| Persisted changes; no dead buttons / fake analytics | All actions hit real APIs; analytics from DB aggregates | DONE | E5 |

## §6 Event creation & lifecycle

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Physical/virtual/hybrid; public/unlisted/invite-only; free RSVP + paid | Event editor + visibility rules | DONE | E1, E10 |
| Full field set (agenda, speakers, accessibility, tz, coords…) | schema + editor + detail page | DONE | DATA_MODEL |
| Draft/scheduled/published/postponed/cancelled/live/ended with transition rules | `ALLOWED_TRANSITIONS` + transition API + notify attendees | DONE | E5 |
| Cancelled events keep financial history | status-only change; orders/ledger untouched | DONE | E9 |
| Recurring series with per-occurrence inventory/attendance | `EventSeries` + 4 seeded Sunday occurrences | DONE | E1 |
| Private invitations: RSVP, guest limits, approval; excluded from search/feeds | `Invitation`, `Rsvp`, visibility filters, hidden address | DONE | E10 |
| Directions via configured map link; UTC + IANA tz | `mapsUrl`, `directionsUrl`, timezone fields | DONE | E1 |
| Series edit distinguishes occurrence vs future | Occurrence-level editing (documented scope) | PARTIAL | IMPLEMENTATION_PLAN |

## §7 Discovery & social

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Country/city/date/category/free-paid/mode filters + This Week/Weekend/Live | `buildDiscoveryWhere` + Discover UI chips | DONE | E1 |
| Follow, save, interest, share, following feed | social routes + `Me` + feed | DONE | E5 |
| Privacy controls on attendance/interests | `EventInterest.privacy` | DONE | DATA_MODEL |
| Organizer updates, clips, reactions, moderated discussion/Q&A | EventUpdate, MediaAsset CLIP reels, Comment, Reaction, moderation | DONE | E1 |
| Report/block/mute | social routes + admin moderation | DONE | E11 |
| Follow ≠ promotional SMS consent | Separate consent registry + quiet hours | DONE | E13 |
| Previous-event clips lead to next occurrence | `linksToEventId` → Reels "Next occurrence" card | DONE | E1 |
| Cancelled events excluded from purchase recommendations | discovery filters | DONE | E10 |
| Explainable ranking (follows/interests/geo/date); no fake AI label | deterministic ordering + featured/sponsored labels | DONE | E1 |
| Optional AI descriptions/translations with real provider | AI concierge with real provider (nonessential) | PARTIAL | E6 |
| Round 14: organizer AI advisor grounded in the org's real sales data; honest fallback, advisory only | `POST /orgs/{id}/ai-advisor` — pricing (validated vs real ticket types + bounds) + digest; labelled `AI` vs `heuristic fallback` | DONE | R14 |
| Round 15: AI review digest ("What attendees say") grounded in visible reviews only, cached by fingerprint, source-labelled | `GET /events/{id}/review-digest` + `aiDigest.ts` — AI summary vs in-code stats fallback, regenerated when reviews change | DONE | R15 |
| Round 15: AI moderation triage as decision support — ids validated, advisory only, never auto-hides | `POST /events/{id}/moderation-triage` + `aiTriage.ts` — org-gated, 6/min, hallucinated ids dropped, honest UNAVAILABLE state | DONE | R15 |

## §8 Ticket inventory, orders, admission

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Ticket types w/ prices, quotas, windows, buyer limits, group offers, codes | `TicketType`, `DiscountCode`, editor UI | DONE | E2 |
| Capacity enforced with DB transactions/constraints | `createOrder` transaction + quota invariant | DONE | E2 |
| Expiring reservations w/ configurable policy | 15-min configurable `reservationMinutes` + sweep | DONE | E7 |
| Separate orders/payment attempts; immutable snapshots; itemized receipts | Order/OrderItem/PaymentAttempt/feeSnapshot/Invoice | DONE | E2 |
| Opaque/signed QR w/o personal data | `IEVX1.{id}.{hmac}` + server QR SVG | DONE | E2 |
| Ownership/transfer rules, ticket states, audit trail | transfer tokens + status machine + AuditLog | DONE | E2 |
| Free RSVP issuance; sold-out; accessible retrieval | fulfilFreeOrder + My Tickets | DONE | E2 |
| Distinct entry/online/replay entitlements; physical ≠ virtual unlock | ticketType.includesVirtualAccess + entitlement resolution | DONE | E6 |
| Ticket only after authoritative payment / valid free RSVP; replay-safe | fulfilment idempotency + ProviderEvent dedup | DONE | E2, E7 |
| Late success vs expired inventory: fulfil if capacity else explicit exception/refund | `fulfilPaidOrder` re-reservation or RefundCase routing | DONE | E14 |
| Round 15: retrying payment after provider-side expiry/cancel starts a FRESH checkout session, never replays a dead URL | stale REDIRECTED/PENDING attempts (>30 min) → EXPIRED + new attempt; `?cancelled=1` return marks the attempt; late SUCCESS callback still fulfils (status never gates) | DONE | R15 |
| Round 15: "Remind me" opt-in for fans without tickets (in-app alert ~24 h before) | `EventReminder` model + `POST/POST /events/{id}/reminder(-cancel)` + reminder sweep opt-in pass (ticket holders excluded, per-event dedup marker) | DONE | R15 |
| Round 15: attendee CSV export (org-only, audited PII egress) | `GET /events/{id}/export` — text/csv attachment, `event.export-attendees` audit row, foreign-org 403 | DONE | R15 |

## §9 Hubtel payment integration

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Hosted checkout flow; card data never enters app | adapter + simulator page (real flow blocked on credentials) | PARTIAL | PROVIDER_CAPABILITIES |
| Round 14: connect real credentials without redeploy; empirical contract calibration | admin-console credential storage (DB over env, masked, audited) + one-click GHS 1.00 connection probe with persisted verdict/snippet | DONE (path ready — live verdict fires when keys are saved) | PROVIDER_CAPABILITIES, R14 |
| Round 15: payout submission closes automatically when the provider is reachable | `PAYOUT_STATUS_POLL` worker sweep — Send Money status probe (`checkSendMoneyStatus`): SUCCESS → PAID + hold released + owner notified; FAILED → reversal journal + hold released; 404/unreachable NEVER produces a verdict (STATUS_ENDPOINT_UNVERIFIED note, manual confirm stays); bounded 20 checks | DONE (simulator live; real verdict fires when Send Money keys exist) | R15 |
| Round 15: payout lifecycle exercisable without credentials (dev) | simulator branch in `submitPayout` (`SIM-` refs) + synthetic completion via the same poll | DONE | R15 |
| Unique references per attempt; persisted before async | paymentReference + immediate persistence | DONE | E2 |
| Callbacks stored durably, acked promptly, idempotent effects | intakeCallback + worker + dedup keys | DONE | E2, E7 |
| No invented HMAC; server-to-server verification | documented + status-check adapter | DONE | E14 |
| Amount/currency comparison before granting | applyProviderOutcome mismatch → REJECTED | DONE | E14 |
| Reconciliation ≥5 min, bounded retries, ops queue | reconcilePayments (6 checks → UNKNOWN) | DONE | E7, E11 |
| Ambiguous stays unresolved; timeout never re-charges/erases | PENDING/UNKNOWN safe states | DONE | E14 |
| Duplicates, stale callbacks, unknown refs, outages, late success | all paths coded + simulator scenarios | DONE | E14 |
| Success/failure/pending/unknown/reversal; redacted raw events | PaymentAttempt statuses + redaction | DONE | E11 |
| Integer minor units; ₵ display; ISO code in API | money module everywhere | DONE | E2 |

## §10 Ledger, refunds, payouts

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Balanced append-only ledger; corrections by reversal | postJournal + reversal journals | DONE | E5 |
| Organizer view: gross, fees, refunds, pending, available, completed | `orgFinanceSummary` + Finance tab | DONE | E5 |
| Sales volume ≠ platform revenue ≠ profit | separate metrics + copy | DONE | E5 |
| Fee rules snapshotted; configurable w/ audit | FeeVersion + order snapshot + admin versioning | DONE | E11 |
| Refunds per verified contract; unsupported → MANUAL_TRACKED | processRefund + manual path | DONE | E9 |
| Refund revokes unused entitlements; reversal only on confirmation; no repeats | ticket revoke + journal + status guard | DONE | E9 |
| Payout request/approve/submit/reconcile/fail-recover | full lifecycle + holds | DONE | E11 |
| Destination change restrictions + approver recorded | audited payout profile + approve role | DONE | E11 |
| No escrow invention; ledger = accounting infra | documented settlement model | DONE | PAYMENTS doc |

## §11 Plans & subscription billing

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Basic/Pro/Org plans w/ entitlements (dev labels) | SubscriptionPlan + admin editing | DONE | E5 |
| Purchase/renewal, invoices, expiry, cancellation, grace, enforcement | invoice+checkout path (same payment rail) + orgSubscription | DONE | E5 |
| Auto-renew only via supported provider flow w/ consent — else explicit renewal | auto-renew intentionally OFF, documented | DONE | PRODUCT_SPEC |
| Backend-enforced limits; expiry keeps tickets/history | assertCanPublishNewEvent + policy | DONE | E5 |

## §12 Hubtel SMS & notifications

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| SMS adapter w/ separate creds + approved sender | hubtel/sms.ts (blocked on creds → simulator) | PARTIAL | PROVIDER_CAPABILITIES |
| Transactional + approved organizer messaging | messaging routes + compose UI w/ recipients | DONE | E13 |
| Durable queue w/ dedup, retries, delivery history, failure visibility | MessageDelivery + outbox + logs | DONE | E13 |
| Acceptance ≠ delivery; store message IDs; follow delivery states | ACCEPTED vs DELIVERED states + polling | DONE | E13 |
| In-app notifications, push, SMTP email | notifications + realtime push + nodemailer/SUPPRESSED | DONE | E5 |
| Consent separation, quiet hours, quotas, suppression, segment estimates | consent + 20–08h + quotas + estimator UI | DONE | E13 |
| Dev never sends live messages; truthful status | simulator + integration health | DONE | E11 |

## §13 Broadcasting, paid viewing, replay

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Free public + paid/restricted broadcasts | LiveBroadcast accessPolicy + entitlements | DONE | E6 |
| Studio: schedule, access policy, viewer preview | StudioView | DONE | E5 |
| Private ingest URL/key; rotate/revoke; never to attendees | rotateStreamKey + organizer-only exposure | DONE | E5 |
| Phone-camera publishing — real implementation | camera preview + input health only | DEFERRED | mobile docs (needs native dev build) |
| Input health, connection status, recording status | studio health panel + broadcast fields | PARTIAL | E5 |
| Server-verified entitlement for paid/invited | issuePlayback + resolveEntitlement | DONE | E6 |
| Short-lived protected playback + manifest/session enforcement | 10-min tokens, heartbeat, revocation | DONE | E6 |
| Concurrent-session controls, reconnect, revocation | session model (capacity field; per-user single session enforced) | PARTIAL | E6 |
| Adaptive quality/data-saver/loading/ended page | synthetic renderer states; labelled | PARTIAL | E6 |
| Replay availability/pricing explicit | replayPriceMinor + replay UI | DONE | E6 |
| Managed video infra; quotas; viewer-minute costs | adapter + allowances + COST_MODEL | PARTIAL | PROVIDER_CAPABILITIES |
| No piracy-proof claims; link-share limits documented | SECURITY_REVIEW | DONE | docs |
| Delivery costs inside allowance/policy | plan streamMinutes + org allowance | DONE | E5 |

## §14 Promotions & boosts

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Internal sponsored placements w/ budget, schedule, targeting | PromotionCampaign + Promotions tab | DONE | E5 |
| Volunteered data only; no sensitive inference; no minors | targeting limited to cities/categories/interests | DONE | code |
| Clearly labelled sponsored; observed delivery only | "Sponsored" badges + metrics wording | DONE | E1 |
| Charging model, frequency caps, invalid-traffic exclusion | CPM billing + caps + dedup telemetry | DONE | E5 |
| Atomic spend caps; duplicate telemetry can't bill twice | recordTelemetry transaction | DONE | E5 |
| Estimates vs observed vs billed distinguished | campaign UI wording + journals | DONE | E5 |
| External ad connectors (Meta/Google/TikTok) separate future | documented | DEFERRED | IMPLEMENTATION_PLAN |

## §15 Web/Android/iOS & purchase rules

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Web/PWA + Android/iOS source w/ shared contracts | web + mobile/ scaffold | PARTIAL | mobile/README |
| Deep links, secure checkout return | `#/order/{ref}` + `ieventplux://` scheme in scaffold | PARTIAL | mobile docs |
| Purchase capability matrix by channel/market/product | documented in mobile docs + SECURITY_REVIEW | DONE | docs |
| No store-rule bypass; disable affected flows when accounts absent | paid flows labelled; store billing not implemented | DONE | docs |
| No false iOS/Android validation claims | honest status tables | DONE | TEST_REPORT |

## §16 Check-in & offline

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Permission-scoped scanning, manual lookup, duplicate feedback, counts, exports | checkin routes + Attendees tab | DONE | E8 |
| Offline roster (minimized), device/session identity, durable local queue, reconcile | roster endpoint + clientScanId queue + sync | DONE | E8 |
| Offline conflicts surfaced, never discarded | CONFLICT result preserved | DONE | E8 |
| Single-device mode when stricter guarantees needed | documented | DONE | OPERATIONS |
| Cached tickets, online/offline status | Offline ticket wallet (localStorage QR, opened-ticket persistence) + conservative service worker (v3: `/_next/static/` cached only when response declares `immutable` — prod content-hashed chunks; dev chunks never cached, killing the stale-after-recompile class) + honest offline banner | PARTIAL — improved: opened tickets scannable offline; full offline shell boot best-effort | E8, R13, R16 |
| No offline entitlement verification pretense | documented | DONE | docs |

## §17 Administration, moderation, trust

| Requirement | Where | Status | Evidence |
|---|---|---|---|
| Verification before paid selling; public organizer identity/support contact | verification flow + org profiles | DONE | E11 |
| Content report review, event suspension, disputes, audit logs, diagnostics | admin console sections | DONE | E11 |
| Admin settings: plans, fees, categories, limits, templates | fees/plans/settings sections | DONE | E11 |
| Traceable + reversible admin actions; money history never deleted | AuditLog + status-based suspension | DONE | E11 |

## §18 Data model & API coverage

All 40+ listed entities exist (naming normalized; see DATA_MODEL inventory) — **DONE**.
Versioned APIs with server-side validation, pagination, bounded uploads, stable error codes, correlation IDs, OpenAPI — **DONE** (E3).

## §19 Security, reliability, costs

Password/session handling, CSRF posture (SameSite + JSON), rate limits (19 documented), upload checks, XSS sanitization, secret redaction — **DONE** (SECURITY_REVIEW; LINT/TSC).
Durable outbox, bounded retries, dead-letter, idempotent paid effects — **DONE** (E7).
Health/readiness, structured logs, queue diagnostics, metrics — **DONE** (E3, E11).
Backup/restore + cost worksheet — **DONE** (OPERATIONS, COST_MODEL).

## §20 Verification & acceptance cases

All 20 cases are mapped to evidence in `TEST_REPORT.md` §E1–E14 plus documented status: **17 verified live** (cases 1,2,4,5,6,7,8,9,11,12,13,14,16,17,19,20 + ledger balance), **3 verified at logic level with simulator/provider-boundary caveats** (3 late-payment — E14; 10 refund-execution double-run guard — E9 logic + code path; 15 subscription expiry enforcement — E5 logic; 18 timezone occurrence generation — seeded weekly series verified; native/perf checks documented as not run). Playwright suite + PostgreSQL integration tests: **DEFERRED** — replaced by scripted browser/API verification this pass, documented honestly.

## §21 Dev data, config, deployment

Deterministic seeds (synthetic identities/media) — **DONE**.
`.env.example` + typed validation + truthful missing-config states — **DONE** (E3).
Simulator isolation (production refusal) — **DONE** (env.ts guard).
Docker/compose/CI — **DEFERRED** (documented in DEPLOYMENT with production runbook).
No live payments/SMS/purchases during development — **DONE**.

## §22 Stages A–F

A–E implemented (see IMPLEMENTATION_PLAN stage map). F: integration verification done to the extent possible without credentials; defect fixes applied (payment parser casing, jQuery easing, check-in FK bug, route conflict); deployment rehearsal documented; handoff delivered.

## §23 Chief architect handoff

All listed documents exist, including this matrix, TEST_REPORT, DEPLOYMENT, and CHIEF_ARCHITECT_HANDOFF with demo routes/accounts, statuses and verification commands.

## §24 Official integration references

Recorded verbatim in `docs/PROVIDER_CAPABILITIES.md` with the honest note that live-doc verification requires credentials at integration time.
