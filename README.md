# iEventPlux

**Events discovery, ticketing, social & broadcasting platform for Ghana.**
Built for Lightworld Technologies Ltd. — Accra, Ghana. Prices in Ghana cedis (₵).

> Discover an event → connect with its organizer → attend physically or virtually.

---

## What is running here

| Surface | Location | Notes |
|---|---|---|
| Web portal (single page) | `/` | Hash-routed SPA: Discover, Live Now, Reels, Effects Studio, event pages, checkout, My Tickets, organizer workspace, admin console |
| REST API v1 | `/api/v1/*` | Versioned, OpenAPI at `/api/v1/openapi`, health at `/api/v1/health` |
| Background worker | `:3001` | Durable outbox queue: payment reconciliation, reservations expiry, reminders, lifecycle, SMS delivery polling |
| Realtime service | `:3003` | socket.io: live chat, viewer presence, notification push |
| Mobile (source scaffold) | `mobile/` | Expo/React Native — **not device-tested**; see `mobile/README.md` |
| Database | SQLite via Prisma | 56 models, integer minor-unit money, portable schema |

**Important integration status (honest):** Hubtel Checkout + SMS adapters are implemented against the documented v1 contracts but **not sandbox-verified** (no credentials were supplied). Without credentials the platform runs an **isolated development payment/SMS simulator** — every order, callback, reconciliation, ticket, ledger journal and delivery state is real against the database; only the provider boundary is simulated and clearly labelled. Payouts (Hubtel Send Money) and live video (Cloudflare Stream) are **externally blocked** — recorded and tracked, never faked. See `docs/PROVIDER_CAPABILITIES.md`.

## Quick start (development)

```bash
bun install
bun run db:push          # create schema
bun run db:seed          # deterministic dev data (synthetic identities + media)
bun run dev              # web + API on :3000

# separate terminals (mini-services):
cd mini-services/worker   && bun run dev    # :3001
cd mini-services/realtime && bun install && bun run dev   # :3003
```

Copy `.env.example` → `.env`. Every variable is documented; typed startup validation lives in `src/server/env.ts` and surfaces at `GET /api/v1/health` + Admin → Integrations.

### Demo accounts (DEVELOPMENT ONLY — password `Dev@12345`)

| Account | Role | What to try |
|---|---|---|
| `ama@example.dev` | Attendee | Buy tickets → simulator checkout → My Tickets QR → voice concierge |
| `pastor@lightworld.dev` | Chapel OWNER | Organizer workspace: dashboard, events, check-in scanner, studio, finance ledger |
| `media@lightworld.dev` | Event manager | Event editing, promotions, messaging |
| `usher@lightworld.dev` | Check-in staff | Scan tickets (duplicate detection) |
| `accra@eventco.dev` | Unverified organizer | Sees the verification gate on paid sales |
| `admin@ieventplux.dev` | SUPER_ADMIN | Admin console: verify orgs, payments, refunds, payouts, sweeps, integrations |
| `finance@ieventplux.dev` | FINANCE_ADMIN | Refund processing (requires password re-confirmation) |

## Demo journeys (verified end-to-end)

1. **Paid ticket purchase** — Open *Accra Gospel Night of Wonders* → Get tickets → select 2 VIP (₵400) → Checkout → the **Hubtel dev simulator** page opens → *Approve payment* → the callback is stored durably, the worker fulfils idempotently → order PAID, 2 tickets + QR issued, balanced ledger posted (DR collections ₵400 / CR fees ₵20 / CR organizer payable ₵380), SMS receipt queued. Try the simulator's *forged amount*, *duplicate callback*, *pay late* and *walk away* buttons to see the documented protection paths.
2. **Free RSVP** — Sunday Celebration Service → Free RSVP → tickets issued without payment.
3. **Check-in** — Organizer workspace → Attendees & Check-in → Scan (camera where supported, or paste `TKT-…`) → ADMITTED; scan again → DUPLICATE; forged QR → INVALID.
4. **Organizer verification gate** — `accra@eventco.dev` cannot publish paid tickets until an admin approves the org (Admin → Organizations → Approve).
5. **Refund with privileged re-auth** — Admin → Refunds → Approve → Process (prompts for password elevation) → tickets revoked + reversal journal.
6. **Live broadcast entitlements** — Watch the free *Worship Without Limits* stream; the paid masterclass requires a virtual ticket (a physical-only ticket never unlocks it).
7. **AI concierge** — Floating spark button → text or hold the mic: answers with **real** upcoming events/prices from the database (LLM + ASR + TTS via the z-ai SDK, backend-only).
8. **CSS Effects Studio** — 38 live, copy-ready effects with live demos and one-tap CSS/HTML copy (`#/effects`).

## Repo map

```
prisma/schema.prisma     56-model data model        src/server/           domain services + Hubtel adapters + jobs
prisma/seed.ts           deterministic dev seed     src/portal/           single-page frontend (jQuery transitions)
src/app/api/v1/          REST API routes            mini-services/        worker (:3001) + realtime (:3003)
src/data/css-effects.ts  38-effect CSS library      mobile/               Expo source scaffold
docs/                    full documentation suite   docs-assets/          verification screenshots
```

## Documentation

`ARCHITECTURE` · `DATA_MODEL` · `PERMISSIONS` · `PAYMENTS_AND_SETTLEMENTS` · `IMPLEMENTATION_PLAN` · `PROVIDER_CAPABILITIES` · `SECURITY_REVIEW` · `OPERATIONS` · `COST_MODEL` · `PRODUCT_SPEC` (in `docs/`), plus `REQUIREMENTS_TRACEABILITY`, `TEST_REPORT`, `DEPLOYMENT` and `CHIEF_ARCHITECT_HANDOFF`.

## Scripts

| Command | Purpose |
|---|---|
| `bun run dev` | Next.js app on :3000 (auto-reload) |
| `bun run lint` | ESLint (clean; warnings only) |
| `bun run db:push` / `db:seed` | Schema push / dev seed |
| `bunx tsc --noEmit` | Type check (clean) |

© Lightworld Technologies Ltd. — iEventPlux is a working development build, **not** a production-ready claim. See `docs/CHIEF_ARCHITECT_HANDOFF.md` for the honest completion assessment.
