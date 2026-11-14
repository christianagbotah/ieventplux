# iEventPlux — Provider Capabilities & Verification Status

| | |
|---|---|
| **Rule** | A mocked flow is **not** a sandbox result. Every integration below is classified exactly: `implemented` (code exists, exercised only through the isolated dev simulator / local paths) · `sandbox-verified` · `live-verified` · `externally-blocked`. |
| **Verification dates** | **Not yet verified against live provider documentation — no credentials were available in this environment.** Endpoint names and field shapes were taken from the client brief (§9, §12, §13) and must be re-verified at integration time against the official references in §6. No verification date can honestly be claimed yet; the "last checked" column records when the adapter was implemented, not provider confirmation. |
| **Runtime source of truth** | `src/server/env.ts` → `integrationStatuses()` surfaced at `GET /api/v1/health` and admin → integrations. |

**Stage legend** (used throughout this suite):

| Stage | Meaning | Evidence required to claim |
|---|---|---|
| `implemented` | Adapter code exists and internal flows are exercised locally (often via the isolated dev simulator) | Code + local runs |
| `sandbox-verified` | Exercised against the provider's sandbox with real credentials | Recorded sandbox test with dates |
| `live-verified` | Exercised in production with real money/messages | Reconciled live transaction/log |
| `externally-blocked` | Cannot proceed without credentials/contract | Named dependency (§9) |

---

## 1. Hubtel Online Checkout (collections) — `implemented`

| | |
|---|---|
| Adapter | `src/server/hubtel/payments.ts` (`initiateCheckout`, `parseCallback`, `checkTransactionStatus`, round 14: `probeCheckoutConnection`) + `src/server/hubtel/credentials.ts` (per-request credential resolution: admin-saved DB values override env) |
| Endpoints used | `POST {HUBTEL_CHECKOUT_BASE}/items/initiate` (Basic auth, JSON: token, description, callbackUrl, returnUrl, cancellationUrl, amount, generateInvoice) · `GET {HUBTEL_CHECKOUT_BASE}/items/{token}` (status check) · callback receiver `POST /api/v1/payments/callback` (our side) |
| Base URL default | `https://pay.hubtel.com` (env-overridable) |
| Contract rules honoured | ResponseCode `0000` = success; failure codes `0001`–`0005`; 5-minute reconciliation rule; **no signature in the v1 callback contract — none invented**; Round 35 enforces authenticated server-to-server verification and a non-null exact amount match BEFORE order/subscription fulfilment; case-tolerant field parsing (PascalCase/camelCase) |
| Credentials needed | Env: `HUBTEL_CHECKOUT_CLIENT_ID`, `HUBTEL_CHECKOUT_CLIENT_SECRET` — **or** (round 14) saved by a super admin in Admin → Integrations → Hubtel connection (stored in `PlatformSetting`, write-only through the API, returned masked only). Hubtel issues ONE API client per business account, so the admin form feeds Checkout, Send Money and SMS together |
| Dev behaviour without credentials | Isolated simulator at `/api/v1/payments/simulator/{reference}` (6 scenarios); simulator cannot run in production, including automatic credential-absent fallback (Round 35). **Round 14: the simulator gate is dynamic** — saving complete checkout keys in the admin console switches checkout to the real provider immediately, no redeploy |
| Round-14 connection probe | `POST /api/v1/admin/hubtel/probe` performs ONE real GHS 1.00 initiate (`probe-{ts}` reference, unpaid sessions expire at the provider — nothing is charged). Verdicts are empirical and persisted: `AUTH_OK_CONTRACT_OK` (2xx + recognized checkoutUrl) · `AUTH_OK_SHAPE_DIFFERS` (authenticated but response shape unknown — calibrate from the persisted snippet) · `AUTH_REJECTED` (401/403) · `ENDPOINT_NOT_FOUND` (404/405 — path/base needs calibration) · `HTTP_{n}` / `UNREACHABLE` / `NOT_CONFIGURED` |
| Remaining to verify | Field names in the initiate response (`checkoutUrl`/`url`/`data.url` all accepted — confirm which is canonical), status-check path shape, failure-code table, callback field casing — the probe's persisted snippet gives the evidence the moment credentials exist |

## 2. Hubtel Send Money (payouts) — `externally-blocked`

| | |
|---|---|
| Adapter | `src/server/hubtel/payments.ts` (`submitPayout`) |
| Endpoint used | `POST {HUBTEL_SENDMONEY_BASE}/api/v1/merchants/{accountId}/sendsmsmoney` (Basic auth; CustomerName, CustomerMsisdn, Description, Amount) |
| Base URL default | `https://app.hubtel.com` |
| Status | Without credentials **and** a merchant agreement, submission is refused (`PAYOUTS_BLOCKED…`) and recorded; the internal lifecycle (REQUESTED→APPROVED→SUBMITTED→PAID/FAILED), settlement holds, journals and same-reference retries all function |
| Credentials/contract needed | `HUBTEL_SENDMONEY_CLIENT_ID`, `HUBTEL_SENDMONEY_CLIENT_SECRET`, `HUBTEL_SENDMONEY_ACCOUNT_ID` **plus** the merchant/payout agreement with Hubtel |
| Remaining to verify | Endpoint path, request/response fields, failure semantics, reconciliation of provider payout status |

## 3. Hubtel SMS — `implemented`

| | |
|---|---|
| Adapter | `src/server/hubtel/sms.ts` (`sendSms`, `checkSmsDelivery`, `estimateSegments`) |
| Endpoints used | `POST {HUBTEL_SMS_BASE}/v1/messages/send` (Basic auth; From = approved sender ID, To[], Content, RegisteredDelivery: true) · `GET {HUBTEL_SMS_BASE}/v1/messages/{messageId}` (delivery state) |
| Base URL default | `https://smsc.hubtel.com` |
| Rules honoured | API acceptance ≠ handset delivery (SENT→ACCEPTED→DELIVERED states); GSM-7 160 / UCS-2 70 segment estimation shown pre-send; dev simulator marks ACCEPTED→DELIVERED locally with an explicit synthetic label |
| Credentials needed | `HUBTEL_SMS_CLIENT_ID`, `HUBTEL_SMS_CLIENT_SECRET`, `HUBTEL_SMS_SENDER_ID` (approved sender ID) |
| Remaining to verify | MessageId field casing, delivery-status vocabulary (DELIVERED/DELIVRD/FAILED/REJECTED/EXPIRED/UNDELIV patterns accepted), RegisteredDelivery behaviour |

## 4. Cloudflare Stream (live video) — `externally-blocked`

| | |
|---|---|
| Integration point | `src/server/env.ts` (automatic Cloudflare selection from `CF_STREAM_*`, no `VIDEO_PROVIDER` flag), `src/server/services/broadcasts.ts` (ingest keys, playback tokens, entitlements) |
| Current mode | `simulator` — synthetic canvas stream renderer, entitlement-gated and clearly labelled (`src/portal/components/PlayerSim.tsx`); ingest keys are generated and shown once but not live |
| Credentials needed | `CF_STREAM_API_TOKEN`, `CF_STREAM_ACCOUNT_ID` |
| Planned usage (per brief) | Live ingest (RTMP/WebRTC for OBS/vMix and phone cameras), signed/protected playback, replays; pricing assumptions in `docs/COST_MODEL.md` |
| Remaining to verify | Direct-creator-upload vs live-input API shape, playback token signing scheme, webhook contract for stream lifecycle |

## 5. SMTP email — `implemented` (mode depends on config)

| | |
|---|---|
| Adapter | `jobs/handlers.ts` (nodemailer transport) |
| Behaviour | With `SMTP_HOST`/`SMTP_USER` configured → real send. Without → messages queued with truthful **SUPPRESSED** status (never fake success). Dev verification codes are exposed with a DEV label only when SMTP is absent |
| Credentials needed | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |

## 6. Official reference list (from the client brief §24)

Read and re-checked at implementation time; **re-verify all of these when credentials arrive**:

- Hubtel overview: https://code.hubtel.com/docs
- Checkout: https://code.hubtel.com/docs/guides/online-checkout
- Authentication/accounts: https://code.hubtel.com/docs/get-started/keys
- Webhooks: https://code.hubtel.com/docs/webhooks
- Reconciliation: https://code.hubtel.com/docs/guides/reconciliation
- Refunds: https://code.hubtel.com/docs/guides/refunds
- SMS delivery: https://code.hubtel.com/docs/guides/sms-delivery
- Cloudflare Stream live: https://developers.cloudflare.com/stream/stream-live/
- Protected playback: https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
- Video pricing: https://developers.cloudflare.com/stream/pricing/
- vMix streaming configuration: https://www.vmix.com/help30/StreamingSettings.html
- Apple review/payment rules: https://developer.apple.com/app-store/review/guidelines/
- Google Play payments: https://support.google.com/googleplay/android-developer/answer/9858738

## 7. In-platform services (no external dependency)

| Service | Status | Notes |
|---|---|---|
| Realtime (socket.io) | `implemented` (live in-process) | Rooms `broadcast:{id}` + `user:{id}`; authenticated `/emit` ingress with `REALTIME_SECRET`; authorization in the API layer |
| Worker + OutboxJob queue | `implemented` (live in-process) | Claim/lock/stale-reclaim; bounded retries → DEAD; idempotent handlers |
| AI concierge (z-ai-web-dev-sdk) | `implemented` | LLM chat + ASR/TTS voice turn; server-side only; real DB context; disable via `AI_CONCIERGE_ENABLED=false` |
| PostgreSQL database | `implemented` (dev and production data model) | Embedded user-space PostgreSQL in development; managed PostgreSQL required for production. SQLite is historical only. |

## 8. Sandbox verification protocol (execute when credentials arrive)

The exact steps that upgrade each integration's stage — no stage changes without these:

**Hubtel checkout** (`implemented` → `sandbox-verified` → `live-verified`):

1. Read the current `online-checkout` guide; diff field names against `src/server/hubtel/payments.ts` (initiate request/response, callback payload, status-check path). Fix diffs in the adapter (case-tolerant parser already absorbs casing drift).
2. Configure sandbox `HUBTEL_CHECKOUT_*`; set `PAYMENTS_SIMULATOR=0`; confirm `/api/v1/health` flips the integration to `real`.
3. Run the six scenario equivalents against the sandbox (small amounts): initiate → success callback; failure; amount mismatch; duplicate callback; no-callback + reconciliation; late payment after hold expiry.
4. Verify the ledger journals and order states match `docs/PAYMENTS_AND_SETTLEMENTS.md` §3.1 exactly.
5. `live-verified` only after a real transaction reconciles end-to-end on the live keys.

**Hubtel SMS** (`implemented` → `sandbox-verified`): verify sender ID approval; send to a test handset; poll delivery states until DELIVERED; confirm the accepted status vocabulary maps to `checkSmsDelivery`'s patterns; confirm segment billing matches the contracted rate.

**Hubtel Send Money** (`externally-blocked` → `sandbox-verified`): after credentials + merchant agreement, verify the submission endpoint path/fields, then test REQUESTED→APPROVED→SUBMITTED→PAID and the FAILED→reversal→same-reference-retry path with the provider's sandbox before enabling live payouts.

**Hubtel refunds**: verify the refunds guide; if an API path exists for eligible full-order MoMo refunds, wire it into `processRefund` (replacing the `MANUAL_TRACKED` early return) and re-run the refund acceptance case; otherwise keep MANUAL_TRACKED.

**Cloudflare Stream** (`externally-blocked` → `sandbox-verified`): configure `CF_STREAM_*`; verify live-input creation and ingest key shape; verify playback token signing against the "securing your stream" guide; test a OBS test stream end-to-end (ingest → entitlement → token-gated playback → end → replay).

Each completed step updates `integrationStatuses()` in `src/server/env.ts` and this document's tables, with the verification date recorded — that is the moment "not yet verified" stops being true.

## 9. Exact remaining credential/contract dependencies

| # | Dependency | Unblocks |
|---|---|---|
| 1 | Hubtel checkout sandbox keys (`CLIENT_ID`/`SECRET`) | Sandbox verification of initiate/callback/status; then live collections |
| 2 | Hubtel merchant agreement + Send Money credentials | Payout provider submission (currently blocked, tracked) |
| 3 | Hubtel SMS credentials + approved sender ID | Live SMS + delivery receipts |
| 4 | Hubtel refunds guide verification (with keys) | Replacing `MANUAL_TRACKED` auto-routing for eligible refunds |
| 5 | Cloudflare Stream API token + account | Real live video ingest/playback/replay (replaces synthetic renderer) |
| 6 | SMTP relay credentials | Transactional email (currently SUPPRESSED, truthful) |
| 7 | PostgreSQL instance | Production database migration |
| 8 | Native build toolchain + devices | Android/iOS apps; on-device RTMP publishing verification |

Nothing in the current system pretends any of the above exist: the health endpoint, admin integrations console and this document all report the same stages.

## 10. Adapter inventory & honesty rules

Every provider boundary in the codebase, with its failure mode when unconfigured:

| Adapter file | Wraps | Unconfigured behaviour |
|---|---|---|
| `src/server/hubtel/payments.ts` | Hubtel checkout + Send Money | Checkout → isolated simulator (internal flows fully real); Send Money → refused with recorded blocker |
| `src/server/hubtel/sms.ts` | Hubtel SMS send + delivery | Dev simulator (ACCEPTED→DELIVERED labelled synthetic); never claims real delivery |
| `jobs/handlers.ts` (email branch) | SMTP via nodemailer | Messages queued `SUPPRESSED` with reason — no fake success |
| `src/server/env.ts` + `PlayerSim.tsx` | Cloudflare Stream | Synthetic canvas renderer, entitlement-gated, clearly labelled |
| `/api/v1/ai/[mode]` | z-ai-web-dev-sdk (LLM/ASR/TTS) | Runs server-side; disable flag; never essential to money/core flows |

Rules the adapters follow (enforced by review, documented here):

1. **No invented endpoints** — every URL traces to the brief's official references (§6) or an env override.
2. **No invented signatures** — the v1 callback contract's lack of HMAC is stated, not papered over.
3. **No silent success** — an unconfigured provider degrades to a labelled simulator/suppressed/blocked state; `integrationStatuses()` reports the same.
4. **Simulators are isolatable** — production startup refuses forced simulator flags.
5. **Redaction at the boundary** — provider payloads are scrubbed before storage or logs.
