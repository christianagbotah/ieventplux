import { db } from '../../lib/db'
import { llmJson } from '../ai/llm'

/**
 * Round 15: AI moderation triage — organizer decision support, never a decision.
 *
 * Honesty contract:
 *  - Scans the event's recent VISIBLE comments, VISIBLE written reviews and
 *    open audience questions; the LLM sees only ids + text.
 *  - Every returned id is validated against the rows actually fetched — a
 *    hallucinated id can never flag a real (or imaginary) item.
 *  - Verdicts are ADVISORY: nothing is hidden, removed or throttled. The
 *    organizer applies moderation with the existing controls.
 *  - When the LLM is unavailable the response says so ('UNAVAILABLE') — there
 *    is no keyword-heuristic pretending to be intelligence.
 */

export type TriageKind = 'COMMENT' | 'REVIEW' | 'QUESTION'
export type TriageVerdict = 'OK' | 'SPAM' | 'ABUSE' | 'OFF_TOPIC'

export interface TriageItem {
  id: string
  kind: TriageKind
  verdict: TriageVerdict
  reason: string
  excerpt: string
}

export interface TriageResult {
  source: 'AI' | 'UNAVAILABLE'
  scanned: number
  flagged: number
  items: TriageItem[]
  note?: string
}

const TRIAGE_SYSTEM = `You triage user-generated content at an event page for a moderator. For each item decide one verdict: OK (fine), SPAM (ads, scams, links, self-promotion, flooding), ABUSE (harassment, hate, threats, explicit content), OFF_TOPIC (unrelated to this event). Ground every reason in the item's own text. Do not flag opinions, criticism, complaints about the event, or non-English text. Reply as JSON: {"items":[{"id":string,"kind":string,"verdict":"OK"|"SPAM"|"ABUSE"|"OFF_TOPIC","reason":string}]}. Include EVERY input id exactly once.`

export async function moderationTriage(eventId: string): Promise<TriageResult> {
  const [comments, reviews, questions] = await Promise.all([
    db.comment.findMany({ where: { eventId, status: 'VISIBLE' }, select: { id: true, body: true }, orderBy: { createdAt: 'desc' }, take: 60 }),
    db.eventReview.findMany({ where: { eventId, status: 'VISIBLE' }, select: { id: true, rating: true, body: true }, orderBy: { updatedAt: 'desc' }, take: 40 }),
    db.audienceQuestion.findMany({ where: { eventId, status: { in: ['NEW', 'ANSWERED'] } }, select: { id: true, body: true }, orderBy: { createdAt: 'desc' }, take: 60 }),
  ])

  const candidates: { id: string; kind: TriageKind; text: string }[] = [
    ...comments.map((c) => ({ id: c.id, kind: 'COMMENT' as const, text: c.body })),
    ...reviews.filter((r) => r.body && r.body.trim().length >= 2).map((r) => ({ id: r.id, kind: 'REVIEW' as const, text: `(${r.rating}/5) ${r.body}` })),
    ...questions.map((q) => ({ id: q.id, kind: 'QUESTION' as const, text: q.body })),
  ]
  const textOf = new Map(candidates.map((c) => [c.id, c.text]))
  const scanned = candidates.length
  if (scanned === 0) return { source: 'AI', scanned: 0, flagged: 0, items: [], note: 'Nothing to triage yet — no comments, questions or written reviews on this event.' }

  try {
    const payload = candidates.slice(0, 120).map((c) => ({ id: c.id, kind: c.kind, text: c.text.slice(0, 500) }))
    const raw = await llmJson<{ items?: { id?: unknown; kind?: unknown; verdict?: unknown; reason?: unknown }[] }>(
      TRIAGE_SYSTEM,
      `Event content items (JSON):\n${JSON.stringify(payload)}`
    )
    const validIds = new Set(candidates.map((c) => c.id))
    const KINDS: TriageKind[] = ['COMMENT', 'REVIEW', 'QUESTION']
    const VERDICTS: TriageVerdict[] = ['OK', 'SPAM', 'ABUSE', 'OFF_TOPIC']
    const items: TriageItem[] = (raw.items ?? [])
      .map((i) => ({
        id: String(i.id ?? ''),
        kind: KINDS.includes(String(i.kind) as TriageKind) ? (String(i.kind) as TriageKind) : 'COMMENT',
        verdict: VERDICTS.includes(String(i.verdict) as TriageVerdict) ? (String(i.verdict) as TriageVerdict) : ('OK' as TriageVerdict),
        reason: String(i.reason ?? '').slice(0, 200),
      }))
      .filter((i) => validIds.has(i.id) && i.verdict !== 'OK' && i.reason.trim().length > 0)
      .map((i) => ({ ...i, excerpt: (textOf.get(i.id) ?? '').slice(0, 160) }))

    return { source: 'AI', scanned, flagged: items.length, items }
  } catch {
    return {
      source: 'UNAVAILABLE',
      scanned,
      flagged: 0,
      items: [],
      note: 'The AI reviewer is unavailable right now — try again in a minute. Nothing was flagged or hidden.',
    }
  }
}
