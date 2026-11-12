import { db } from '../../lib/db'
import { formatMoney } from '../money'
import { llmJson } from '../ai/llm'

/**
 * Organizer AI advisor — round 14.
 *
 * Honesty contract (same as the AI route §7): the LLM only ever annotates REAL
 * transactional data gathered from this org's own rows. Every suggestion is
 * validated against the org's actual ticket types and price bounds before it
 * reaches the organizer, nothing is auto-applied (advisory only — prices change
 * solely when the organizer edits them), and if the LLM is unavailable the
 * response degrades to a clearly-labelled deterministic heuristic computed in
 * code. No invented metrics: sales pace, sell-through and waitlist pressure
 * all come from real rows.
 */

const DAY_MS = 86_400_000
/** Absolute advisory price ceiling: ₵5,000 per ticket — guards against bad LLM output. */
const ABS_MAX_PRICE_MINOR = 500_000
/** A suggestion may move a price at most 5× in either direction per review. */
const MAX_PRICE_RATIO = 5

export interface PricingAssessment {
  eventId: string
  eventTitle: string
  ticketTypeId: string
  ticketTypeName: string
  currentPriceMinor: number
  suggestedPriceMinor: number | null
  verdict: 'RAISE' | 'HOLD' | 'LOWER' | 'SOLD_OUT'
  rationale: string
  pctSold: number // 0–1 real sell-through (quota > 0 only; 0 quota → -1)
  daysOut: number // days until event start (negative = past)
  waitlist: number
}

export interface AdvisorResult {
  kind: 'pricing' | 'digest'
  source: 'ai' | 'heuristic'
  note: string | null
  // pricing
  assessments?: PricingAssessment[]
  // digest
  headline?: string
  paragraphs?: string[]
  actions?: string[]
}

interface EventRow {
  id: string
  title: string
  status: string
  startsAt: Date
  city: string | null
  categorySlug: string
  ticketTypes: { id: string; name: string; priceMinor: number; quota: number; soldCount: number; active: boolean }[]
  waitlistCount: number
  soldLast14: number
}

async function gatherOrgData(orgId: string) {
  const now = new Date()
  const since14 = new Date(now.getTime() - 14 * DAY_MS)
  const events = await db.event.findMany({
    where: { orgId, deletedAt: null, status: { in: ['PUBLISHED', 'SCHEDULED', 'LIVE', 'POSTPONED', 'ENDED'] } },
    orderBy: { startsAt: 'asc' },
    take: 12,
    select: {
      id: true, title: true, status: true, startsAt: true, city: true, categorySlug: true,
      ticketTypes: { where: { active: true }, select: { id: true, name: true, priceMinor: true, quota: true, soldCount: true, active: true } },
      _count: { select: { waitlistEntries: { where: { status: { in: ['WAITING', 'NOTIFIED'] } } } } },
    },
  })
  // Real demand pace: tickets issued per event over the last 14 days.
  const recent = await db.ticket.groupBy({ by: ['eventId'], where: { event: { orgId }, issuedAt: { gte: since14 } }, _count: { _all: true } })
  const recentByEvent = new Map(recent.map((r) => [r.eventId, r._count._all]))

  // Real comparables: median of the cheapest active ticket across PUBLIC upcoming
  // events of the same category in the same city (other organizers).
  const categories = [...new Set(events.map((e) => e.categorySlug))]
  const comparables = await db.event.findMany({
    where: {
      visibility: 'PUBLIC', deletedAt: null, status: { in: ['PUBLISHED', 'LIVE'] }, startsAt: { gte: now },
      categorySlug: { in: categories.length ? categories : ['__none__'] }, orgId: { not: orgId },
    },
    select: { categorySlug: true, city: true, ticketTypes: { where: { active: true }, select: { priceMinor: true } } },
    take: 60,
  })
  const medianByCat = new Map<string, number>()
  for (const slug of categories) {
    const prices = comparables
      .filter((c) => c.categorySlug === slug)
      .map((c) => Math.min(...c.ticketTypes.map((t) => t.priceMinor).filter((p) => p > 0), Number.POSITIVE_INFINITY))
      .filter((p) => Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b)
    if (prices.length) medianByCat.set(slug, prices[Math.floor(prices.length / 2)])
  }

  const rows: EventRow[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    status: e.status,
    startsAt: e.startsAt,
    city: e.city,
    categorySlug: e.categorySlug,
    ticketTypes: e.ticketTypes,
    waitlistCount: e._count.waitlistEntries,
    soldLast14: recentByEvent.get(e.id) ?? 0,
  }))
  return { rows, medianByCat, now }
}

/** Deterministic fallback — always available, clearly labelled in the response. */
function heuristicAssessments(rows: EventRow[], now: Date): PricingAssessment[] {
  const out: PricingAssessment[] = []
  for (const e of rows) {
    const daysOut = Math.round((e.startsAt.getTime() - now.getTime()) / DAY_MS)
    for (const t of e.ticketTypes) {
      const quota = t.quota > 0 ? t.quota : 0
      const pctSold = quota > 0 ? Math.min(t.soldCount / quota, 1) : -1
      let verdict: PricingAssessment['verdict'] = 'HOLD'
      let suggested: number | null = null
      if (quota > 0 && t.soldCount >= quota) {
        verdict = 'SOLD_OUT'
      } else if (pctSold >= 0.85) {
        verdict = 'RAISE'
        suggested = Math.round(t.priceMinor * 1.1)
      } else if (pctSold >= 0 && pctSold <= 0.2 && daysOut > 0 && daysOut < 14 && t.priceMinor > 0) {
        verdict = 'LOWER'
        suggested = Math.round(t.priceMinor * 0.9)
      }
      const rationale =
        verdict === 'SOLD_OUT'
          ? `Sold out (${t.soldCount}/${quota})${e.waitlistCount > 0 ? ` with ${e.waitlistCount} on the waitlist` : ''} — consider a second release or higher tier.`
          : verdict === 'RAISE'
            ? `${Math.round(pctSold * 100)}% sold${e.soldLast14 > 0 ? `, ${e.soldLast14} in the last 14 days` : ''} — demand supports about +10%.`
            : verdict === 'LOWER'
              ? `Only ${Math.round(pctSold * 100)}% sold with ${daysOut} day${daysOut === 1 ? '' : 's'} to go — about −10% can widen the funnel.`
              : `${quota > 0 ? `${t.soldCount}/${quota} sold` : 'Open quota'} — pace looks normal for ${daysOut > 0 ? `${daysOut} days out` : 'this stage'}.`
      out.push({
        eventId: e.id, eventTitle: e.title, ticketTypeId: t.id, ticketTypeName: t.name,
        currentPriceMinor: t.priceMinor, suggestedPriceMinor: suggested, verdict, rationale,
        pctSold: pctSold < 0 ? -1 : Math.round(pctSold * 100) / 100, daysOut, waitlist: e.waitlistCount,
      })
    }
  }
  return out
}

function validateSuggestion(current: number, suggested: unknown): number | null {
  const n = Math.round(Number(suggested))
  if (!Number.isFinite(n) || n < 0 || n > ABS_MAX_PRICE_MINOR) return null
  if (current > 0 && (n > current * MAX_PRICE_RATIO || n < current / MAX_PRICE_RATIO)) return null
  return n
}

export async function orgPricingAdvisor(orgId: string): Promise<AdvisorResult> {
  const { rows, medianByCat, now } = await gatherOrgData(orgId)
  const live = rows.filter((e) => e.status !== 'ENDED' && e.startsAt.getTime() >= now.getTime() - 6 * 3600_000)
  const scoped = (live.length ? live : rows).slice(0, 6)
  if (scoped.length === 0) {
    return { kind: 'pricing', source: 'heuristic', note: 'No active events with ticket types yet — create an event first.', assessments: [] }
  }

  const fallback = heuristicAssessments(scoped, now)

  try {
    const lines = scoped.map((e) => {
      const median = medianByCat.get(e.categorySlug)
      const tt = e.ticketTypes
        .map((t) => {
          const quota = t.quota > 0 ? t.quota : null
          const pct = quota ? Math.round((Math.min(t.soldCount / quota, 1) * 100)) : null
          return `${t.name}: ₵${(t.priceMinor / 100).toFixed(2)}${quota ? `, ${t.soldCount}/${quota} sold (${pct ?? 'open'}%)` : ', open quota'}`
        })
        .join('; ')
      return `- id=${e.id} | "${e.title}" | ${e.categorySlug}${e.city ? ` | ${e.city}` : ''} | ${e.status.toLowerCase()} | starts ${e.startsAt.toUTCString()} | sold last 14d: ${e.soldLast14} | waitlist: ${e.waitlistCount} | tickets: ${tt}${median ? ` | category median price (other organizers): ₵${(median / 100).toFixed(2)}` : ''}`
    })
    const system = [
      'You are the iEventPlux pricing advisor for event organizers in Ghana (currency ₵).',
      'Respond with ONLY JSON: {"assessments": [{"eventId": string, "ticketTypeName": string, "verdict": "RAISE"|"HOLD"|"LOWER"|"SOLD_OUT", "suggestedPriceMinor": number|null, "rationale": string}]}',
      'suggestedPriceMinor is an INTEGER in pesewas (e.g. ₵55.00 = 5500). Rules: RAISE only when sell-through/pace clearly supports it (suggest at most +10–15%); LOWER only when time is short and sales are slow (at most −10–15%); SOLD_OUT when quota reached; otherwise HOLD. Suggested price must be within 5× of the current price. rationale = max 160 chars, concrete, referencing the real numbers. Never invent events or ticket types.',
    ].join('\n')
    const parsed = await llmJson<{ assessments?: { eventId?: string; ticketTypeName?: string; verdict?: string; suggestedPriceMinor?: unknown; rationale?: string }[] }>(system, lines.join('\n'))
    const byKey = new Map(fallback.map((a) => [`${a.eventId}::${a.ticketTypeName.toLowerCase()}`, a]))
    const assessments: PricingAssessment[] = []
    for (const raw of parsed.assessments ?? []) {
      if (!raw.eventId || !raw.ticketTypeName) continue
      const base = byKey.get(`${raw.eventId}::${raw.ticketTypeName.toLowerCase()}`)
      if (!base) continue // not a real ticket type of this org — dropped
      const verdict = ['RAISE', 'HOLD', 'LOWER', 'SOLD_OUT'].includes(String(raw.verdict)) ? (String(raw.verdict) as PricingAssessment['verdict']) : base.verdict
      const suggested = verdict === 'HOLD' || verdict === 'SOLD_OUT' ? null : validateSuggestion(base.currentPriceMinor, raw.suggestedPriceMinor)
      assessments.push({
        ...base,
        verdict,
        suggestedPriceMinor: suggested,
        rationale: String(raw.rationale ?? base.rationale).slice(0, 200) || base.rationale,
      })
    }
    if (assessments.length === 0) throw new Error('no valid assessments')
    return { kind: 'pricing', source: 'ai', note: null, assessments }
  } catch {
    return { kind: 'pricing', source: 'heuristic', note: 'AI was unavailable — these are deterministic pace heuristics computed from your real sales data.', assessments: fallback }
  }
}

export async function orgDigestAdvisor(orgId: string): Promise<AdvisorResult> {
  const { orgInsights } = await import('./insights')
  const insights = await orgInsights(orgId)
  const t = insights.totals
  const now = new Date()

  const templateHeadline = insights.topEvents[0]
    ? `${insights.topEvents[0].title} leads with ${insights.topEvents[0].tickets} tickets.`
    : 'No ticket sales yet — your first event will headline this digest.'
  const templateParagraphs = [
    `Across ${t.eventsHeld + t.eventsUpcoming} events you have sold ${t.ticketsSold} tickets for ${formatMoney(t.grossMinor)} settled gross. The last ${insights.windowDays} days added ${t.windowTickets} tickets and ${formatMoney(t.windowGrossMinor)}.`,
    t.ticketsSold > 0
      ? `${t.checkedIn} of ${t.ticketsSold} tickets have been scanned at doors (${Math.round(t.checkInRate * 100)}%).${t.avgRating ? ` Attendees rate you ${t.avgRating}/5 across ${insights.topEvents.reduce((s, e) => s + e.reviewCount, 0)} visible reviews.` : ''}`
      : 'No issued tickets yet — publish an event and share it to start the funnel.',
    t.waitlistDemand > 0
      ? `${t.waitlistDemand} fan(s) are waiting on waitlists right now — capacity moves convert them into sales.`
      : 'No waitlist pressure at the moment.',
  ]
  const templateActions = [
    t.waitlistDemand > 0 ? 'Raise capacity or release returned tickets to convert waitlist demand.' : 'Share your best-performing event to your channels this week.',
    t.checkInRate < 0.5 && t.ticketsSold > 0 ? 'Prepare door staffing — under half of issued tickets are scanned so far.' : 'Send an important update to ticket holders with the event-day essentials.',
    insights.topEvents[0] && insights.topEvents[0].status !== 'ENDED' ? `Keep momentum on "${insights.topEvents[0].title}" — it is your top seller.` : 'Publish your next event while this one is still fresh.',
  ]

  const fallback: AdvisorResult = { kind: 'digest', source: 'heuristic', note: 'AI was unavailable — this digest is a deterministic template over your real numbers.', headline: templateHeadline, paragraphs: templateParagraphs, actions: templateActions }

  if (t.ticketsSold === 0 && t.eventsUpcoming === 0) return fallback

  try {
    const lines = [
      `Totals: ${t.ticketsSold} tickets sold, ${formatMoney(t.grossMinor)} settled gross, ${t.eventsHeld} held, ${t.eventsUpcoming} upcoming.`,
      `Last ${insights.windowDays} days: ${t.windowTickets} tickets, ${formatMoney(t.windowGrossMinor)} gross.`,
      `Check-in rate ${Math.round(t.checkInRate * 100)}% (${t.checkedIn}/${t.ticketsSold}).${t.avgRating ? ` Average rating ${t.avgRating}/5.` : ''}`,
      t.waitlistDemand > 0 ? `Waitlist demand: ${t.waitlistDemand} waiting.` : 'No waitlist demand.',
      'Top events: ' + insights.topEvents.slice(0, 5).map((e) => `"${e.title}" (${e.status.toLowerCase()}, ${e.tickets} tickets, ${formatMoney(e.grossMinor)}, ${e.checkedIn} checked in${e.ratingAvg ? `, rating ${e.ratingAvg}` : ''})`).join('; '),
      'Ticket mix: ' + insights.ticketMix.slice(0, 5).map((m) => `${m.name} ${m.tickets}× ${formatMoney(m.revenueMinor)}`).join('; '),
    ].join('\n')
    const system = [
      'You write a short weekly business digest for an event organizer on iEventPlux (Ghana, currency ₵).',
      'Respond with ONLY JSON: {"headline": string, "paragraphs": string[], "actions": string[]}.',
      'headline: max 90 chars. paragraphs: exactly 3 sentences (array of 3 strings, each max 220 chars), concrete and grounded in the numbers. actions: exactly 3 imperative next steps (each max 140 chars).',
      'Use ONLY the provided numbers — never invent sales, events or ratings.',
    ].join('\n')
    const parsed = await llmJson<{ headline?: string; paragraphs?: unknown; actions?: unknown }>(system, lines)
    const paragraphs = Array.isArray(parsed.paragraphs) ? parsed.paragraphs.filter((p): p is string => typeof p === 'string').slice(0, 3).map((p) => p.slice(0, 300)) : []
    const actions = Array.isArray(parsed.actions) ? parsed.actions.filter((a): a is string => typeof a === 'string').slice(0, 3).map((a) => a.slice(0, 180)) : []
    if (!parsed.headline || paragraphs.length === 0) throw new Error('bad digest shape')
    return { kind: 'digest', source: 'ai', note: null, headline: String(parsed.headline).slice(0, 120), paragraphs, actions: actions.length ? actions : templateActions }
  } catch {
    return fallback
  }
}
