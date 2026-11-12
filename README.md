# iEventPlux

Events discovery, ticketing and broadcasting for Lightworld Technologies Ltd.
Stage A foundation: pnpm/TypeScript monorepo, local infrastructure and PostgreSQL
data model. The old Next.js/SQLite prototype has been removed from this branch.

## Requirements and local setup

- Node.js 22+ (Node 24 supported), Corepack, pnpm **9.15.9**, Docker Compose.
- `corepack enable` then `corepack prepare pnpm@9.15.9 --activate`.
- Optionally copy `.env.example` to `.env` for overrides. Development defaults
  work without an env file; provider credentials are deliberately empty.

```sh
docker compose up -d --wait
pnpm install --frozen-lockfile
pnpm db:migrate                  # prisma migrate deploy, not db push
pnpm db:seed
pnpm --filter @ieventplux/db test
pnpm lint
pnpm typecheck
pnpm build
```

PostgreSQL 16 (`5432`), Redis 7 (`6379`), Mailpit SMTP (`1025`) and Mailpit UI
(`http://localhost:8025`) are the only services running at this stage. All four
apps are TypeScript placeholders: `pnpm dev` watches them but does **not** serve
the product UI, an API, worker queues or an Expo application yet. Framework
initialization and provider adapters are subsequent handoffs.

## Workspace

| Path                                                 | Responsibility                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/web`, `apps/api`, `apps/worker`, `apps/mobile` | Web/API/worker/mobile placeholders                                                    |
| `packages/contracts`, `packages/sdk`                 | Shared contracts and SDK placeholders                                                 |
| `packages/config`                                    | Zod environment validation and development-operation guards                           |
| `packages/design-tokens`                             | Starter TypeScript colors and CSS variables                                           |
| `packages/integrations`                              | Provider adapter placeholder                                                          |
| `packages/db`                                        | PrismaClient export, schema, migrations, deterministic seed and real-PostgreSQL tests |

## Database conventions

- PostgreSQL enums, JSONB, UTC `timestamptz`, IANA event timezone, `char(3)`
  currencies. Monetary amounts use integer minor units (GHS pesewas); ledger
  entries and stream usage use BigInt.
- Legacy `Event` represents an **event occurrence**, optionally belonging to an
  `EventSeries`. Profile fields remain on `User`. Organization roles are the
  `MembershipRole` enum; permission policy belongs in shared contracts rather
  than editable database permission grants. These are the existing equivalents
  of the brief's EventOccurrence, Profile and Role/Permission concepts.
- `CSSEffect`, `AiConversation`, `AiMessage` are not retained. Added models include
  EventStaff, SettingChange, PayoutDestination, Country, NotificationTemplate,
  IdempotencyKey, StreamUsage, ConsentSuppression and Settlement. Scan conflicts
  remain represented by `AdmissionScan.result = CONFLICT`.
- The initial migration is Prisma-generated. The second migration owns inventory
  and promotion CHECK constraints, ledger append-only and balance triggers,
  the platform-account partial unique index, and financial-history delete guards.
  These SQL invariants are not fully represented by Prisma schema introspection;
  do not replace migrations with `db push`.
- Write a journal and **all** its entries in the same database transaction.
  Balance is checked at commit, including rejection of empty journals; account
  and journal currencies must match. Entries cannot be added to committed
  journals. Corrections use new reversal journals, never updates/deletes.
- Main money records cannot be deleted or truncated. `pnpm db:reset` explicitly
  drops/recreates the development schema and does not reseed automatically. It
  and the seed refuse staging/production, including `NODE_ENV=production`.

## Seed and media

The seed ports the legacy Ghana catalog, identities, organizations, memberships,
plans, fees, categories, series, free/paid/hybrid/private/unlisted events, ticket
types, broadcasts and social examples. It adds countries, assigned event staff,
notification templates, balanced sample paid/free orders and tickets, and manual
refund/payout/promotion examples. All data and credentials are synthetic.

- Fixed fixture epoch: `2026-11-12T00:00:00Z`; explicit stable IDs; UTC scheduling.
- One transaction plus an advisory lock; repeat runs detect `dev-seed-v1` and
  leave existing data unchanged. Reset before changing the fixture dataset.
- Password: **`Dev@12345`**, Argon2id via `@node-rs/argon2`. The fixed salt is only
  for deterministic development fixtures, never for production password hashing.
- Admin: `admin@ieventplux.dev`; finance: `finance@ieventplux.dev`;
  organizer: `pastor@lightworld.dev`; event staff: `usher@lightworld.dev`;
  attendees: `ama@example.dev`, `kojo@example.dev`, `akua@example.dev`.
- Ghana is organizer/payout-enabled. GB and US are view-only.
- `apps/web/public/images/posters/*.png` are copied legacy synthetic posters;
  the legacy README explicitly describes its seed as synthetic identities and
  media. No external stock or scraped media was added.
- Seeded QR values are synthetic fixtures, not a production admission protocol.

## Environment and tests

Every loader variable is documented in `.env.example`. Production requires
explicit database/Redis, storage, public URL, Hubtel per-API, SMS, Cloudflare and
SMTP settings; simulator mode is forbidden. SMTP auth and Expo access tokens are
optional where the provider/relay permits unauthenticated use. AI is optional.
Environment error messages identify variable names without printing secrets.

Database tests use **only** `TEST_DATABASE_URL` (separate database ending in
`_test`), deploy both migrations, then run Vitest against real PostgreSQL. The
Compose initialization script creates `ieventplux_test` on first volume startup.
If reusing a preexisting volume that lacks it, create that database explicitly
before running tests. Tests add isolated synthetic fixtures and never touch the
development catalog. Keep the database test suite sequential per database.

`pnpm test` runs all workspace tests; `pnpm --filter @ieventplux/config test`
runs environment safety unit tests independently. Root `dev`, `build`, `lint`,
`typecheck`, `test` use Turborepo. No external provider calls or deployment occur.
