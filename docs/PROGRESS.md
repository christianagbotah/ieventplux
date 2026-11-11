# PROGRESS — iEventPlux build

**Branch:** `main` · **Last milestone commit:** see `git log` (docs + handoff commit).
**Status at write time:** all planned stages complete to the extent possible without external credentials; handoff delivered.

## Completed (verified)

- **Stage A:** 56-model Prisma schema; typed env validation + integration statuses; auth/sessions/elevation; permission matrices; money/fees/ledger/outbox/audit; Hubtel checkout + SMS adapters with isolated dev simulator; QR/HMAC; seed (14 users / 4 orgs / 19 events / real fulfilment paths / 38 CSS effects / synthetic posters).
- **Stage B:** Events lifecycle + discovery + visibility rules; social (follows/saves/interests/comments/reactions/reels/reports); invitations + RSVP; org profiles; organizer workspace shell.
- **Stage C:** Transactional orders + reservations; payment initiate/callback/return/status; simulator scenario page; idempotent fulfilment; late/duplicate/forged handling; QR tickets + transfers; check-in (scan/lookup/roster/offline sync w/ conflict preservation); ledger journals; refunds (+ elevation); payouts lifecycle; subscriptions via the same payment rail; Hubtel SMS + consent/quiet-hours/quotas; notifications + message queue.
- **Stage D:** Broadcasts (entitlements, playback tokens + heartbeats, key rotation), realtime chat/presence/notifications (:3003), labelled synthetic player, studio (camera preview + health + OBS ingest).
- **Stage E:** Promotions with atomic budgets; admin console (12 sections); AI concierge (text + real-time voice with real DB context); Effects Studio (38 live demos + copy code); mobile Expo scaffold.
- **Stage F:** lint/tsc clean; agent-browser end-to-end verification (purchase→ticket→QR→check-in; org verification; refund elevation; integrations truth) with 4 defects found & fixed; docs suite + traceability + test report + deployment + this handoff.

## Failing checks

None open. (`bun run lint`: 0 errors / warnings only. `bunx tsc --noEmit`: 0 errors.)

## External blockers

Hubtel checkout/Send Money/SMS credentials + merchant agreement; Cloudflare Stream credentials; SMTP relay; Apple/Google store accounts; git remote. All truthfully surfaced at `/api/v1/health` and Admin → Integrations.

## Next tasks for the next engineer/session

1. Connect a git remote and push (`git remote add origin … && git push -u origin main`).
2. Obtain Hubtel credentials → run the sandbox verification protocol in `docs/PROVIDER_CAPABILITIES.md` (re-verify v1 endpoints first).
3. Migrate to PostgreSQL for concurrency (`docs/ARCHITECTURE.md` migration path) + add load/concurrency smoke tests.
4. Add automated test suite (jest integration + Playwright journeys from TEST_REPORT E1–E14).
5. Native dev builds for mobile broadcasting + store billing configuration.
6. Bulk "apply to future occurrences" series editing; shared-store rate limiting when scaling beyond one instance.

## Commands to resume

```bash
bun run dev                                   # :3000
(cd mini-services/worker && bun run dev &)    # :3001
(cd mini-services/realtime && bun run dev &)  # :3003
bun run db:seed   # optional reset of dev data
```
