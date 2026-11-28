# Staging acceptance matrix — fixture batch qa27

Use the staging web and released Android app, then repeat on iOS when a signed build exists. Record device, release SHA, account role, steps, expected result, actual result and defect link. Never use live money, real customer details or actual provider messages for fixture testing. Do not expose test credentials in this public repository.

| Area | Fixture / acceptance test | Expected result |
|---|---|---|
| Identity | Organizer, buyer, unverified, staff, finance | Correct workspace, isolation and verification prompts; no admin access |
| Organizations | Events company, church, tech association, festival, pending company | Owners see own membership and events; pending org cannot bypass approval |
| Discovery | Upcoming, past, draft, private and live events | Accurate dates, categories, images, filters and visibility |
| Tickets | Existing paid/free orders; valid and checked-in tickets | Buyer sees own tickets, organizer sees sales, staff sees admission, no duplicate check-in |
| Registration | Free tier and invite-only RSVP | Correct quota, duplicate prevention, private access restrictions |
| Programme | Agenda, contributors, update, souvenir | Render details; organizer changes persist, cross-org access rejected |
| Live | Private scheduled meeting and engagement practice event | Admission eligibility, media permission prompt; poll/vote/question/moderation; live media still needs two real devices |
| Awards | Rising Talent Awards, two categories, four nominees | One vote per category, authorized results visibility |
| Marketplace | Four stores, 16 goods, 32 variants, sold-out variant | Accurate catalogue, stock ledger, prices, basket and requests |
| Stock holds | Acknowledged request | Only after gated hold pilot enabled: reserve/release/expiry, no duplicate hold |
| Social | Follow, save, direct message, notifications | Correct recipient and unread count; no cross-account leakage |
| Service directory | Three pending provider profiles | Owner sees onboarding state; unapproved providers absent from public discovery |
| Transport | Draft charter vehicle | Draft editing; no actual transport dispatch or claimed credentials |
| Payments | Synthetic paid order history | Display as demo; real checkout/refund/payout blocked. Sandbox-only financial lifecycle testing separately |
| Native parity | Repeat each applicable workflow on released APK | No unnecessary web redirects, good layouts, actionable errors |
| Pilot readiness | Test registration/organization/store creation with controlled identities | Separate pilot records; no preexisting QA records after reviewed removal |

## Cleanup gate
Run inspect-fixture-dependencies.sql as a read-only application role after testing. Record counts, inspect direct and indirect references, distinguish seeded and subsequently created records, retain real-account transactions and evidence, and review all uploaded media. Suspend fixture accounts and revoke sessions before a separately authorized removal. Do not clear standard categories or globally reset staging. This query is an inventory, not a teardown script.

## Remaining scope
Master architecture also includes AI, creator monetization, advanced transport dispatch, utilities, healthcare, learning, finance and analytics. These require their own acceptance fixtures and provider approval; do not fabricate operational licences, health providers, real availability, settlement or external provider success. No production certification from a seed alone.
