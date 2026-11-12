import { db } from '../../lib/db'
import { llmJson } from '../ai/llm'

/**
 * Round 15: AI review digest — "What attendees say".
 *
 * Honesty contract:
 *  - Grounded ONLY in VISIBLE reviews of this event. The LLM receives the exact
 *    review texts and is instructed to never invent themes, names or numbers.
 *  - Cached in PlatformSetting keyed by a fingerprint (count + average +
 *    newest review edit). New/edited reviews regenerate automatically; no TTL
 *    games that could show a stale picture silently.
 *  - With fewer than 2 written reviews, or when the LLM is unavailable, the
 *    digest is computed IN CODE from the real distribution (source 'STATS') —
 *    the card always labels its source, so a template never masquerades as AI.
 */

export interface ReviewDigest {
  available: boolean
  reason?: 'NO_REVIEWS' | 'NO_TEXT'
  summary: string | null
  source: 'AI' | 'STATS' | null
  generatedAt: string | null
}

const SETTING_PREFIX = 'ai.reviewDigest:'

const DIGEST_SYSTEM = `You summarize verified attendee feedback for an event page. Use ONLY the provided reviews — never invent themes, names, or numbers; do not cite ratings that are not in the input. Write 2-4 plain-text sentences (no markdown), neutral and specific: state the consensus, then notable dissent if any. Reply as JSON: {"summary": string}.`

export async function reviewDigest(eventId: string): Promise<ReviewDigest> {
  const reviews = await db.eventReview.findMany({
    where: { eventId, status: 'VISIBLE' },
    select: { id: true, rating: true, body: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
  const count = reviews.length
  if (count === 0) return { available: false, reason: 'NO_REVIEWS', summary: null, source: null, generatedAt: null }

  const withText = reviews.filter((r) => r.body && r.body.trim().length >= 2)
  const avg = Math.round((reviews.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10
  const newestEdit = reviews[0]?.updatedAt.toISOString() ?? ''
  const fingerprint = `${count}:${avg}:${withText.length}:${newestEdit}`

  const cached = await db.platformSetting.findUnique({ where: { key: SETTING_PREFIX + eventId } })
  if (cached) {
    try {
      const parsed = JSON.parse(cached.value) as ReviewDigest & { fingerprint: string; summary: string | null; source: 'AI' | 'STATS' | null }
      if (parsed.fingerprint === fingerprint && parsed.summary) {
        return { available: true, summary: parsed.summary, source: parsed.source, generatedAt: parsed.generatedAt }
      }
    } catch {
      /* invalid cache row — regenerate below */
    }
  }

  const dist = [5, 4, 3, 2, 1].map((rating) => ({ rating, n: reviews.filter((r) => r.rating === rating).length }))
  let summary = buildStatsSummary(avg, count, dist, withText.length)
  let source: 'AI' | 'STATS' = 'STATS'

  if (withText.length >= 2) {
    try {
      const payload = withText
        .slice(0, 40)
        .map((r) => `- (${r.rating}/5) ${r.body!.slice(0, 300)}`)
        .join('\n')
      const result = await llmJson<{ summary?: string }>(DIGEST_SYSTEM, `Event reviews (${withText.length} written):\n${payload}`)
      const text = (result.summary ?? '').trim()
      if (text.length >= 20) {
        summary = text.slice(0, 700)
        source = 'AI'
      }
    } catch {
      /* LLM unavailable → the in-code statistical summary below is the honest fallback */
    }
  }

  const payload = { fingerprint, summary, source, generatedAt: new Date().toISOString() }
  await db.platformSetting
    .upsert({
      where: { key: SETTING_PREFIX + eventId },
      update: { value: JSON.stringify(payload) },
      create: { key: SETTING_PREFIX + eventId, value: JSON.stringify(payload) },
    })
    .catch(() => {})

  return { available: true, summary, source, generatedAt: payload.generatedAt }
}

function buildStatsSummary(avg: number, count: number, dist: { rating: number; n: number }[], textCount: number): string {
  const top = dist.filter((d) => d.n > 0).sort((a, b) => b.n - a.n)
  const parts: string[] = [`Attendees rate this event ${avg}/5 across ${count} verified review${count === 1 ? '' : 's'}.`]
  if (top.length > 0) {
    const described = top.slice(0, 3).map((d) => `${d.n} gave ${d.rating} star${d.rating === 1 ? '' : 's'}`).join(', ')
    parts.push(`Rating mix: ${described}.`)
  }
  if (textCount === 0) parts.push('No written feedback yet — star ratings only.')
  return parts.join(' ')
}
