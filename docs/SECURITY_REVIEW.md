# iEventPlux — Security Review

| | |
|---|---|
| **Scope** | AuthN/AuthZ boundaries, session security, tenancy isolation, money protection, private data, rate limiting, XSS, secrets — for the deployment in this repository |
| **Method** | Code-path review of `src/server/*` plus scripted browser/API verification of the hostile cases below (evidence: `docs/TEST_REPORT.md`) |
| **Posture** | Honest: strengths and known limitations are both listed. No penetration-test claim is made. |

---

## 1. Authentication & authorization boundaries

| Boundary | Mechanism | Result of bypass attempts (verified) |
|---|---|---|
| Anonymous → user | HttpOnly cookie `ievx_session` (sha256-hashed token in `Session`) | No cookie/invalid token → 401 `UNAUTHORIZED`; revoked/expired sessions rejected |
| User → platform staff | `User.role` + `platformCan()` on every admin route | Non-staff → 403 on `/api/v1/admin/*` |
| User → org member | `Membership` resolved **from the session** (`membershipFor` / `eventOrgAccess`) | Caller-supplied `orgId` never grants anything — cross-org organizers get 403 |
| Org member → role permission | `orgCan(role, permission)` matrix (`src/server/permissions.ts`) | e.g. ANALYST calling attendee endpoints → 403; CHECKIN_STAFF calling finance → 403 |
| Finance privileged action | `requireElevated()` — password re-check stamped on the session, valid 10 min | Without elevation → 401 `ELEVATION_REQUIRED`; after 10 min the window lapses |
| Buyer → other buyer's order | `order.userId` check or unique reference knowledge | Order access requires being the buyer or holding the `ORD-…` reference |
| Ticket transfer | One-time claim token + authenticated claim | Replay of a consumed token fails |
| Playback | Hashed 10-min token + entitlement check + heartbeat | Token replay after expiry/revocation fails |

Design invariant: **every authorization decision is server-side and session-derived**; the hash router and any client-supplied ids have no influence.

## 2. Session security

- Tokens: 192-bit random (nanoid-based `sessionToken()`), stored **only as sha256 hashes** (`Session.tokenHash @unique`) — a database leak does not yield usable cookies.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`, 14-day expiry.
- Passwords: bcrypt (cost 10) via bcryptjs; verification failure-resistant.
- Revocation: per-session `revokedAt`; **password reset revokes all sessions globally** for the account.
- Elevation: separate `elevatedAt` stamp with a 10-minute window — privileged finance actions re-check the password.
- Sessions are invalidated when the user is `SUSPENDED`/`DELETED` (`status`/`deletedAt` checked on every `getSession`).
- `timingSafeEqual` for secret comparisons (`safeEqual`).
- Login/verification/reset endpoints are rate-limited (§6).

## 3. Tenancy isolation (checks performed)

Scripted verification exercised the isolation matrix (detailed evidence in `TEST_REPORT.md`):

| Check | Expected | Mechanism |
|---|---|---|
| Organizer A requests Organizer B's event management endpoint | 403 | `eventOrgAccess` resolves the event's org, then A's membership — absent → deny |
| Organizer A fetches B's orders / attendees / finance | 403 | `orders:view`/`attendees:view`/`org:view_finance` evaluated against membership |
| Caller passes `?orgId=` of another org to org-scoped routes | 403 — the param scopes queries only after membership proof | `membershipFor(session.user, orgId)` |
| Check-in staff of org X scans a ticket of org Y | INVALID scan recorded (`Ticket belongs to another event`) | `services/checkin.ts` event/ticket binding |
| Deleted/suspended org members | membership lookups exclude soft-deleted orgs | `org: { deletedAt: null }` filters |
| Device sessions | hashed device tokens; rosters minimized to what door ops need | `DeviceSession.tokenHash @unique` |

## 4. Money protection

| Threat | Control |
|---|---|
| Client-tampered prices | **Server-side pricing only** — totals computed from `TicketType.priceMinor` inside the order transaction; buyers submit quantities, never amounts |
| Replay/double-charge | Unique per-attempt provider references persisted **before** any async processing; `ProviderEvent.dedupKey @unique`; `PaymentAttempt` status guards |
| Forged callbacks (amount tampering) | Amount comparison against the attempt amount; mismatch → attempt UNKNOWN + event REJECTED (simulator `forged-amount` scenario verifies rejection) |
| Duplicate fulfilment | Order-status re-read inside the fulfilment transaction + unique ticket codes + ledger idempotency key `order-payment:{orderId}:{attemptId}` |
| Duplicate *payments* | Second success → auto RefundCase + `EXCEPTION_REVIEW` — money never silently absorbed |
| Ledger tampering | Append-only; journals immutable; corrections are reversal journals; unbalanced journals throw; DR=CR enforced |
| Payout double-pay | Failed payouts reverse via `payout-reversal:{id}` and **retry with the same reference**; settlement holds block double-disposal of the same funds |
| Refund abuse | Only FINANCE_ADMIN/SUPER_ADMIN with elevation process refunds; repeat/refunded-again cases blocked; unused tickets revoked before money moves |
| Simulators in production | `env.ts` throws at startup if `PAYMENTS_SIMULATOR`/`SMS_SIMULATOR` are forced on with `NODE_ENV=production` |

## 5. Private data rules

| Data | Rule |
|---|---|
| UNLISTED events | excluded from discovery, search, feeds — link-only access |
| INVITE_ONLY events | venue address hidden until approved RSVP; invitations code-gated with guest limits |
| QR payloads | `IEVX1.{ticketId}.{hmac}` — **no personal data**; HMAC recomputed server-side at scan time |
| Callback/provider payloads | redacted before storage (cardNumber, cardCVV, pin, otp, customerName, mobileNumber deleted; 2 000-char cap) |
| Payout destinations | stored as JSON on the Payout row; only org payout roles + platform finance see them; logs never echo them |
| Attendee lists | org-only (see `PERMISSIONS.md`); device rosters minimized |
| Interest/save data | private per user; aggregates only to organizers |
| Consent | per (target, channel, scope); marketing sends SUPPRESSED without consent |
| Dev verification codes | DEV-labelled and only when SMTP is absent — never in production |
| AI concierge | server-side only; conversations scoped to the authenticated user |

## 6. Rate limits (per instance, per IP)

Implemented in `src/server/api.ts` (`rateLimit`) — enforced on:

| Scope | Limit | Window |
|---|---|---|
| `auth` (sign-in / register) | 10 | 60 s |
| `elevate` (password re-check) | 5 | 60 s |
| `verify` (code request/check) | 10 / 5 | 60 s |
| `pwreset` (request / confirm) | 5 / 10 | 60 s |
| `checkout` (order creation) | 20 | 60 s |
| `payments` (initiate) | 20 | 60 s |
| `comment` | 10 | 60 s |
| `reaction` | 30 | 60 s |
| `report` | 5 | 60 s |
| `transfer` (ticket claim) | 10 | 60 s |
| `upload` | 20 | 60 s |
| `scan` (check-in) | 120 | 60 s |
| `sync` (offline batch) | 30 | 60 s |
| `playback` (token issue/verify) | 30 | 60 s |
| `chat` (broadcast messages) | 15 | 60 s |
| `sms-send` (org campaigns) | 5 | 60 s |
| `ai-chat` / `ai-voice` | 20 / 12 | 60 s |
| `fees` (admin versioning) | 10 | 60 s |

Excess → HTTP 429 `RATE_LIMITED`. Buckets are opportunistically garbage-collected (memory bounded).

## 7. XSS & input safety

- **Rendering:** React escapes by default; no `dangerouslySetInnerHTML` on user content in the portal. The payments simulator panel is server-generated with no user interpolation.
- **Server sanitization:** `sanitizeText()` strips `<script>` blocks, `on*=` event handlers and `javascript:` URLs; length caps everywhere (`maxLength` default 5 000).
- **Structured inputs:** zod + explicit parsing (`readJson` rejects non-JSON); tags parsed to bounded string arrays (≤12).
- **Realtime ingress:** `/emit` requires `REALTIME_SECRET`; room names validated `^[\w:-]{1,80}$`; typing usernames truncated to 60 chars.
- **Uploads:** MIME allow-list (PNG/JPEG/WebP) + 5 MB cap; extensions derived from the allow-list, not from client filenames.
- **Chat bodies:** persisted via the API (sanitized) and only relayed by the realtime service.

## 8. Secrets handling

- `.env` is excluded from version control; `.env.example` carries **no real secrets** (development placeholders only).
- Boot validation: `DATABASE_URL` always required; `APP_SECRET` required in production (startup failure otherwise).
- Secrets never reach the client bundle: provider credentials, `WORKER_SECRET`, `REALTIME_SECRET`, `APP_SECRET` are used exclusively in server modules; the AI SDK runs server-side only.
- Logs: provider errors log status codes + redacted bodies (never Authorization headers); `rawResult` stores redacted JSON only; payout destinations and callback PII are not logged.
- Dev defaults for worker/realtime secrets exist **only** for local development and are flagged in `.env.example` for replacement.
- Ticket QR signatures derive from `APP_SECRET` (`{secret}:ticket` domain separation).

## 9. Known limitations (stated plainly)

| # | Limitation | Impact | Planned response |
|---|---|---|---|
| L1 | **Rate limiting is in-memory per instance** | Limits reset per process; multiple app instances multiply effective limits | Move to a shared store (or gateway-level limits) before horizontal scaling |
| L2 | **SQLite in dev deployment** | Single-writer database; no row-level locking granularity of PostgreSQL | PostgreSQL migration (schema portable); documented in `ARCHITECTURE.md` §7 |
| L3 | **Dev simulators exist in the codebase** | Payment/SMS simulators are powerful but development-only | Refusal in production is startup-enforced (`env.ts`); remove flag entirely at go-live hardening review |
| L4 | **No provider signature on v1 callbacks** | Callback authenticity relies on controlled ingress + server-to-server verification + amount checks | Confirm with Hubtel whether a signed webhook (see webhooks guide) is available for the account and adopt it |
| L5 | **Session cookie `SameSite=Lax`** | Cross-site POSTs from other origins are not sent (good); top-level navigations are | Acceptable for this API-cookie shape; revisit if embedding scenarios appear |
| L6 | **Realtime service allows CORS `*`** | Any origin may open a socket; rooms are non-secret names | Room access is entitlement-checked at the API layer for chat, and playback tokens gate viewer data; tighten to the deployed origin at go-live |
| L7 | **No CSRF token layer** | Cookie is `SameSite=Lax`; all mutating endpoints are JSON/fetch with no form-encoded cross-site posts | State-changing routes reject non-JSON bodies (`readJson`); acceptable residual risk documented |
| L8 | **In-memory reminder/sweep markers in worker** | A worker restart re-runs reminder logic | Handlers are idempotent (dedup via `PlatformSetting` markers / status re-checks) |
| L9 | **No formal penetration test / accessibility audit** | Untested attack surface may exist | Commission before public launch |

## 10. Verification commands (reproducible)

```bash
# lint + typecheck (clean at handoff)
bun run lint && bunx tsc --noEmit

# health + integration stages
curl -s http://localhost:3000/api/v1/health | jq .

# worker / realtime health
curl -s http://localhost:3001/health
curl -s http://localhost:3003/health

# OpenAPI contract
curl -s http://localhost:3000/api/v1/openapi | jq '.info'
```

Hostile-case scripts (cross-org 403, forged-amount rejection, duplicate-callback single fulfilment, offline CONFLICT preservation) are recorded in `docs/TEST_REPORT.md` with their exact commands and outputs.
