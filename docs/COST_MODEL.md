# iEventPlux — Cost Model (Editable Usage Worksheet)

| | |
|---|---|
| **Purpose** | Estimate **provider/infrastructure costs** at three usage levels (low / medium / high). Every rate is an explicit, editable assumption — **no number here is a verified contract price** unless marked otherwise. |
| **Deliberately excluded** | Profit forecasts, revenue projections, break-even claims. Costs only, per the product spec. |
| **Currencies** | Hubtel/SMS in GHS; Cloudflare Stream, object storage, email relay in USD. An FX assumption (editable) allows a combined view. |

---

## 1. Assumptions (edit here — everything below recalculates from this table)

| # | Assumption | Low | Medium | High | Source / status |
|---|---|---|---|---|---|
| A1 | Events published per month (platform total) | 20 | 80 | 300 | usage dial |
| A2 | Paid orders per month | 300 | 2 000 | 10 000 | usage dial |
| A3 | Average order value (₵) | 80 | 120 | 150 | usage dial |
| A4 | **Hubtel processing rate** (% of order value, platform-borne — informational in the ledger) | **1.95%** | **1.95%** | **1.95%** | **EDITABLE — re-verify with Hubtel at onboarding** |
| A5 | SMS segments sent per month (transactional + marketing) | 2 000 | 20 000 | 80 000 | usage dial |
| A6 | **Hubtel SMS list price per segment (₵)** | **0.05** | **0.05** | **0.05** | **EDITABLE — confirm with provider; ledger `smsRateMinor` default 5 pesewas** |
| A7 | Live-stream minutes **delivered** per month (viewer-minutes) | 30 000 | 300 000 | 1 500 000 | usage dial |
| A8 | Live-stream + replay minutes **stored** per month | 2 000 | 20 000 | 100 000 | usage dial |
| A9 | **Cloudflare Stream storage ($ per 1 000 min stored/month)** | **5** | **5** | **5** | **EDITABLE — verify at https://developers.cloudflare.com/stream/pricing/** |
| A10 | **Cloudflare Stream delivery ($ per 1 000 min delivered)** | **1** | **1** | **1** | **EDITABLE — verify at https://developers.cloudflare.com/stream/pricing/** |
| A11 | Object storage for posters/media (GB-month) | 5 | 25 | 120 | usage dial |
| A12 | Object storage price ($/GB-month) | 0.023 | 0.023 | 0.023 | EDITABLE — S3-class list price assumption |
| A13 | Emails relayed per month | 1 000 | 10 000 | 50 000 | usage dial |
| A14 | SMTP relay cost ($ per 1 000 emails) | 1 | 1 | 1 | EDITABLE — depends on chosen relay |
| A15 | App/worker/realtime hosting (flat $/month, single region) | 40 | 80 | 200 | EDITABLE — VM/container estimate |
| A16 | SQLite → PostgreSQL managed DB ($/month) | 0 (SQLite on-host) | 25 | 60 | EDITABLE — production database |
| A17 | FX rate GHS per USD (for the combined view only) | 15 | 15 | 15 | EDITABLE — never booked anywhere in the product; display convenience |
| A18 | Ticket commission (5%, organizer-borne) | 5% | 5% | 5% | platform setting (FeeVersion) — a **revenue share**, not a cost; shown only for context |

In-app notifications ride the realtime service (socket.io) and cost nothing beyond hosting — there is **no external push provider** in this implementation. AI concierge usage rides the bundled z-ai-web-dev-sdk at no marginal cash cost in this environment; if a metered AI provider replaces it, add a per-conversation assumption here.

### Usage dial definitions (what "low/medium/high" means)

| Dial | Low = pilot | Medium = established | High = scaled platform |
|---|---|---|---|
| Profile | A handful of active orgs (e.g. the client's ministry + peers) | Dozens of orgs, weekly ticketed events | Hundreds of orgs, on-sales with thousands of concurrent buyers |
| Driving inputs | A1/A2/A5 at pilot volumes | steady growth, paid broadcasts begin | large concurrent live audiences (A7 dominates) |
| Operational posture | single host, SQLite | + managed PostgreSQL (A16) | consider queue/provider tiering before this level; revisit rate-limit and realtime architecture (`SECURITY_REVIEW.md` L1/L6) |

## 2. Hubtel payment processing (collections)

Processing cost = A2 × A3 × A4.

| Level | Orders (A2) | × Avg order ₵ (A3) | = Volume ₵ | × Rate (A4) | = **Processing cost ₵/month** |
|---|---|---|---|---|---|
| Low | 300 | 80 | 24 000 | 1.95% | **468** |
| Medium | 2 000 | 120 | 240 000 | 1.95% | **4 680** |
| High | 10 000 | 150 | 1 500 000 | 1.95% | **29 250** |

Notes:

- The 5% commission is organizer-borne and never leaves the platform's ledger — it is *not* a cash cost to Lightworld; the 1.95% processing assumption is the platform-borne informational cost in `src/server/fees.ts`.
- Hubtel's actual settlement/charge structure must be confirmed during merchant onboarding; treat A4 as a placeholder until then (see `PROVIDER_CAPABILITIES.md` §1).
- Send Money payout fees are **not modelled** — payouts are externally blocked (no credentials/merchant agreement). Add a per-payout fee row when contracted.

## 3. Hubtel SMS

Cost = A5 × A6. Segment facts encoded in the product: GSM-7 = 160 chars/segment, UCS-2 = 70 chars/segment, max 6 segments/message (`src/server/hubtel/sms.ts`, `settings.ts`). Estimation is shown to organizers **before** any bulk send.

| Level | Segments (A5) | × ₵/segment (A6) | = **SMS cost ₵/month** |
|---|---|---|---|
| Low | 2 000 | 0.05 | **100** |
| Medium | 20 000 | 0.05 | **1 000** |
| High | 80 000 | 0.05 | **4 000** |

## 4. Cloudflare Stream (blocked until credentials — modelled for planning)

Delivery cost = A7 ÷ 1 000 × A10. Storage cost = A8 ÷ 1 000 × A9.

| Level | Delivered min (A7) | Delivery $ | Stored min (A8) | Storage $ | = **Stream $/month** |
|---|---|---|---|---|---|
| Low | 30 000 | 30 000/1 000 × 1 = 30 | 2 000 | 2 000/1 000 × 5 = 10 | **40** |
| Medium | 300 000 | 300 | 20 000 | 100 | **400** |
| High | 1 500 000 | 1 500 | 100 000 | 500 | **2 000** |

Both rates are **editable placeholders** pending verification at the pricing page (see A9/A10). Until `CF_STREAM_*` credentials exist, actual delivery uses the labelled synthetic renderer and this line is ₵0/$0 — the numbers above exist so the business can decide whether to contract the provider.

## 5. Storage (media), email, hosting, database

| Line | Low | Medium | High | Formula |
|---|---|---|---|---|
| Object storage $ | 5 × 0.023 = **0.12** | 25 × 0.023 = **0.58** | 120 × 0.023 = **2.76** | A11 × A12 |
| SMTP email $ | 1 000/1 000 × 1 = **1** | 10 000/1 000 × 1 = **10** | 50 000/1 000 × 1 = **50** | A13 ÷ 1 000 × A14 |
| Hosting (app+worker+realtime+gateway) $ | **40** | **80** | **200** | A15 |
| Database $ | **0** (SQLite) | **25** | **60** | A16 |

## 6. Combined monthly view

| Cost line | Low | Medium | High |
|---|---|---|---|
| Hubtel processing (₵) | 468 | 4 680 | 29 250 |
| SMS (₵) | 100 | 1 000 | 4 000 |
| **GHS subtotal (₵)** | **568** | **5 680** | **33 250** |
| Stream ($) | 40 | 400 | 2 000 |
| Storage ($) | 0.12 | 0.58 | 2.76 |
| Email ($) | 1 | 10 | 50 |
| Hosting ($) | 40 | 80 | 200 |
| Database ($) | 0 | 25 | 60 |
| **USD subtotal ($)** | **81.12** | **515.58** | **2 312.76** |
| USD subtotal expressed in ₵ (× A17, display only) | 1 217 | 7 734 | 34 691 |

Working space — paste-in formulas as plain numbers when editing:

```
GHS subtotal   = (A2 × A3 × A4/100) + (A5 × A6)
USD subtotal   = (A7/1000 × A10) + (A8/1000 × A9) + (A11 × A12) + (A13/1000 × A14) + A15 + A16
Combined (₵)   = GHS subtotal + (USD subtotal × A17)
```

## 7. Sensitivity notes (what moves the number most)

1. **Order volume × average value** dominates the GHS side through the processing-rate assumption — a ±0.25 pp change in A4 moves the high case by ±3 750 ₵/month.
2. **Viewer-minutes delivered** dominates the USD side (A7): one large multi-day conference with 5 000 concurrent viewers ≈ 432 000 viewer-minutes/day — a single event can exceed the monthly "medium" delivery line. Consider per-broadcast caps or sponsor-covered passes before contracting.
3. **SMS segments** scale with reminder/marketing discipline; the 6-segment cap and quiet hours bound the per-message worst case, and pre-send estimation keeps org-side surprises visible.
4. **Stored minutes** only grow if replays are retained — replay inclusion is a plan entitlement (`BASIC` excludes replays), which is the natural cost lever.

## 8. Worked per-event example (organizer-visible costs)

A single medium conference, priced from the same assumptions — useful when explaining costs to an organizer:

| Input | Value | Basis |
|---|---|---|
| Paid tickets sold | 400 | — |
| Average ticket price | ₵150 | — |
| Gross ticket sales | ₵60 000 | 400 × 150 |
| Platform commission (5%, organizer-borne) | ₵3 000 | 60 000 × 5% |
| Organizer payable (before payout) | ₵57 000 | 60 000 − 3 000 |
| Processing (1.95%, platform-borne, informational) | ₵1 170 | 60 000 × 1.95% |
| Reminder SMS (1 segment × 400 buyers) | ₵20 | 400 × 0.05 |
| Live stream delivered (400 viewers × 120 min) | 48 000 min | — |
| Cloudflare delivery cost | $48 | 48 000/1 000 × 1 |
| Replay stored (120 min) | $0.60 | 120/1 000 × 5 |

This is the same arithmetic the platform itself surfaces: organizers see segment estimates pre-send (`/api/v1/messages/estimate`) and finance summaries (`orgFinanceSummary`) — the cost model deliberately mirrors the product's own numbers so the two never disagree.

## 9. How to edit this worksheet

1. Change values only in §1 (the A-table) — §2–§8 restate the formulas with the numbers substituted so a reviewer can audit each line.
2. Keep `EDITABLE` markers on anything not contractually confirmed; when a provider contract signs, replace the assumption with the contracted rate and note the date/source.
3. Re-verify Cloudflare Stream pricing at the official page before contracting (A9/A10) and Hubtel rates at onboarding (A4/A6).
4. When new paid dependencies are added (payout fees, push provider, metered AI), append new A-rows and a matching cost table — do not silently fold them into hosting.

## 10. Not modelled (explicitly)

- Payout (Send Money) fees — provider contract pending.
- Refund return fees (if any) — refund capability pending sandbox verification.
- Native app store fees — no in-app purchase path exists; Apple/Google rules were reviewed in the brief but nothing is sold through store billing today.
- Support/moderation staffing, marketing spend, domain/TLS (Caddy terminates free via internal certs in this environment), and any paid AI usage — add rows when real contracts exist.
- **Profit forecasts — intentionally absent.**
