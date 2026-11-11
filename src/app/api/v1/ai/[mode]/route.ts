import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, sanitizeText } from '@/server/api'
import { db } from '@/lib/db'
import { env } from '@/server/env'
import { formatMoney } from '@/server/money'
import { PUBLIC_EVENT_WHERE, buildDiscoveryWhere } from '@/server/services/events'

/**
 * AI surface (brief §7 — AI assistance is additive, never core-path):
 *  POST /api/v1/ai/chat        { message, conversationId? }        → concierge reply with REAL event context
 *  POST /api/v1/ai/voice       (multipart: audio)                  → ASR → LLM (DB context) → TTS turn
 *  POST /api/v1/ai/search      { query }                           → natural language → validated filters → REAL DB results
 *  POST /api/v1/ai/recommend   {}                                  → history-based picks (LLM) with honest trending fallback
 *  POST /api/v1/ai/studio      { kind, ... }                       → organizer copywriting + poster image generation
 * The z-ai-web-dev-sdk runs server-side only. No fabricated catalogue data: every filter is
 * validated against live categories, and results always come from the database.
 */

type RouteContext = { params: Promise<{ mode: string }> }

// ── Shared LLM helpers ────────────────────────────────────────────────────────

async function llmClient() {
  const ZAI = (await import('z-ai-web-dev-sdk')).default
  return ZAI.create()
}

async function llmReply(system: string, history: { role: string; content: string }[]): Promise<string> {
  const zai = await llmClient()
  const messages = [
    { role: 'assistant' as const, content: system },
    ...history.slice(-10).map((m) => ({ role: (m.role === 'ASSISTANT' || m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user', content: m.content.slice(0, 2000) })),
  ]
  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: 'disabled' },
  })
  const reply = completion.choices[0]?.message?.content
  if (!reply || !reply.trim()) throw errors.unavailable('AI_UNAVAILABLE', 'The assistant could not respond. Please try again.')
  return reply.trim().slice(0, 2000)
}

/** Extract the first JSON object from an LLM response (tolerates prose + code fences). */
function extractJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) throw errors.unavailable('AI_BAD_RESPONSE', 'The assistant returned an unexpected format. Please try again.')
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T
  } catch {
    throw errors.unavailable('AI_BAD_RESPONSE', 'The assistant returned an unexpected format. Please try again.')
  }
}

async function llmJson<T>(system: string, userPrompt: string): Promise<T> {
  const zai = await llmClient()
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant' as const, content: system },
      { role: 'user' as const, content: userPrompt.slice(0, 4000) },
    ],
    thinking: { type: 'disabled' },
  })
  const raw = completion.choices[0]?.message?.content
  if (!raw) throw errors.unavailable('AI_UNAVAILABLE', 'The assistant could not respond. Please try again.')
  return extractJson<T>(raw)
}

async function ttsBase64(text: string): Promise<string | null> {
  try {
    const zai = await llmClient()
    const clipped = text.slice(0, 1000) // SDK limit: 1024 chars; wav is the supported non-streaming format here
    const response = await zai.audio.tts.create({
      input: clipped,
      voice: 'tongtong',
      speed: 1.0,
      response_format: 'wav',
      stream: false,
    })
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(new Uint8Array(arrayBuffer)).toString('base64')
  } catch {
    return null // voice reply degrades to text; never fake audio
  }
}

async function transcribe(buffer: ArrayBuffer): Promise<string> {
  const zai = await llmClient()
  const response = await zai.audio.asr.create({
    file_base64: Buffer.from(new Uint8Array(buffer)).toString('base64'),
  })
  return (response.text ?? '').trim()
}

// ── Concierge context ─────────────────────────────────────────────────────────

async function buildConciergeContext(): Promise<string> {
  const now = new Date()
  const [events, live, categories] = await Promise.all([
    db.event.findMany({
      where: { visibility: 'PUBLIC', deletedAt: null, status: { in: ['PUBLISHED', 'LIVE', 'POSTPONED'] }, startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 12,
      select: { title: true, startsAt: true, city: true, mode: true, categorySlug: true, org: { select: { name: true } }, ticketTypes: { select: { name: true, priceMinor: true }, where: { active: true } } },
    }),
    db.liveBroadcast.findMany({ where: { status: 'LIVE', event: { visibility: 'PUBLIC' } }, take: 4, select: { title: true, accessPolicy: true, event: { select: { title: true } } } }),
    db.category.findMany({ where: { active: true }, take: 10, select: { name: true } }),
  ])
  const lines = events.map((e) => {
    const prices = e.ticketTypes.map((t) => (t.priceMinor === 0 ? 'Free' : formatMoney(t.priceMinor))).slice(0, 3).join(', ')
    return `- "${e.title}" by ${e.org.name} — ${e.categorySlug}, ${e.city ?? 'online'}, ${e.mode.toLowerCase()}, ${e.startsAt.toUTCString()}${prices ? `, tickets: ${prices}` : ''}`
  })
  const liveLines = live.map((b) => `- LIVE NOW: "${b.title}" (${b.accessPolicy === 'FREE' ? 'free stream' : b.accessPolicy === 'PAID' ? 'paid pass' : 'restricted access'}) for ${b.event.title}`)
  return [
    'You are the iEventPlux Concierge for events in Ghana (currency: Ghana cedis, ₵).',
    'Answer helpfully and concisely. Recommend only events listed below — never invent events, prices or availability.',
    'For anything outside this list (refunds, payouts, passwords), point the user to the relevant app section: My Tickets, Orders, or event support contact.',
    liveLines.length ? `Live right now:\n${liveLines.join('\n')}` : '',
    `Upcoming public events:\n${lines.join('\n')}`,
    `Categories: ${categories.map((c) => c.name).join(', ')}.`,
  ].filter(Boolean).join('\n\n')
}

async function ensureConversation(userId: string, mode: 'TEXT' | 'VOICE', conversationId?: string) {
  if (conversationId) {
    const existing = await db.aiConversation.findUnique({ where: { id: conversationId } })
    if (existing && existing.userId === userId) {
      await db.aiConversation.update({ where: { id: existing.id }, data: { lastActiveAt: new Date() } })
      return existing.id
    }
  }
  const created = await db.aiConversation.create({ data: { userId, mode } })
  return created.id
}

// ── AI smart search: natural language → validated filters → real DB results ──

interface ParsedFilters {
  summary?: string
  filters?: {
    category?: string | null
    city?: string | null
    mode?: string | null
    price?: string | null
    when?: string | null
    keywords?: string | null
  }
}

const eventCardSelect = {
  id: true, slug: true, title: true, summary: true, categorySlug: true, coverImageUrl: true,
  mode: true, status: true, startsAt: true, endsAt: true, city: true, country: true,
  isFeatured: true, boostedUntil: true,
  org: { select: { name: true, slug: true, verifiedAt: true } },
  ticketTypes: { select: { priceMinor: true, quota: true, soldCount: true }, where: { active: true } },
} as const

async function runSmartSearch(query: string) {
  const now = new Date()
  const [categories, cityRows] = await Promise.all([
    db.category.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, name: true } }),
    db.event.findMany({ where: { ...PUBLIC_EVENT_WHERE, city: { not: null } }, distinct: ['city'], select: { city: true }, take: 25 }),
  ])
  const categoryList = categories.map((c) => `${c.slug} (${c.name})`).join(', ')
  const cityList = cityRows.map((c) => c.city).filter(Boolean).join(', ')

  const system = [
    'You translate natural-language event searches into JSON filters for iEventPlux, an events platform in Ghana (currency ₵).',
    `Today is ${now.toUTCString()}.`,
    `Valid category slugs: ${categoryList || '(none)'}.`,
    `Known cities: ${cityList || 'Accra'}.`,
    'Respond with ONLY a JSON object, no prose:',
    '{"summary": string, "filters": {"category": string|null, "city": string|null, "mode": "PHYSICAL"|"VIRTUAL"|"HYBRID"|null, "price": "FREE"|"PAID"|null, "when": "TODAY"|"THIS_WEEK"|"THIS_WEEKEND"|null, "keywords": string|null}}',
    'Rules: category must be a slug from the list or null. city must come from the known cities (or null). when maps relative dates (today/this weekend/this week). keywords = 1-3 remaining search words not covered by other filters (or null).',
    'summary = one friendly sentence (max 120 chars) telling the user what you are looking for. Never invent events or prices.',
  ].join('\n')

  const parsed = await llmJson<ParsedFilters>(system, query)
  const f = parsed.filters ?? {}

  const mode = ['PHYSICAL', 'VIRTUAL', 'HYBRID'].includes(String(f.mode)) ? (String(f.mode) as 'PHYSICAL' | 'VIRTUAL' | 'HYBRID') : undefined
  const price = ['FREE', 'PAID'].includes(String(f.price)) ? (String(f.price) as 'FREE' | 'PAID') : undefined
  const when = ['TODAY', 'THIS_WEEK', 'THIS_WEEKEND'].includes(String(f.when)) ? (String(f.when) as 'TODAY' | 'THIS_WEEK' | 'THIS_WEEKEND') : undefined
  const category = categories.some((c) => c.slug === f.category) ? String(f.category) : undefined
  const city = typeof f.city === 'string' && f.city.trim() ? sanitizeText(f.city, 60) : undefined
  const keywords = typeof f.keywords === 'string' && f.keywords.trim() ? sanitizeText(f.keywords, 60) : undefined

  const where = buildDiscoveryWhere({ q: keywords, category, city, mode, price, when }, now)
  const [items, total] = await Promise.all([
    db.event.findMany({ where, orderBy: { startsAt: 'asc' }, take: 12, select: eventCardSelect }),
    db.event.count({ where }),
  ])

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 160) : 'Here is what I found.',
    filters: {
      category: category ?? null,
      city: city ?? null,
      mode: mode ?? null,
      price: price ?? null,
      when: when ?? null,
      keywords: keywords ?? null,
    },
    items,
    total,
  }
}

// ── AI recommendations: real history → LLM picks → honest fallback ───────────

async function runRecommendations(userId: string) {
  const now = new Date()
  const [myTickets, saves, follows] = await Promise.all([
    db.ticket.findMany({
      where: { userId, status: { in: ['VALID', 'CHECKED_IN'] }, event: { deletedAt: null } },
      select: { eventId: true, event: { select: { categorySlug: true, city: true, orgId: true, title: true } } },
      take: 60,
    }),
    db.eventInterest.findMany({
      where: { userId, event: { deletedAt: null } },
      select: { eventId: true, event: { select: { categorySlug: true, city: true, orgId: true, title: true } } },
      take: 60,
    }),
    db.follow.findMany({ where: { followerId: userId, orgId: { not: null } }, select: { orgId: true }, take: 60 }),
  ])

  const attendedIds = [...new Set([...myTickets, ...saves].map((t) => t.eventId))]
  const favCategories = [...new Set([...myTickets, ...saves].map((t) => t.event.categorySlug))]
  const favCities = [...new Set([...myTickets, ...saves].map((t) => t.event.city).filter(Boolean))] as string[]
  const favOrgIds = [...new Set([...myTickets, ...saves].map((t) => t.event.orgId))]
  const followedOrgIds = follows.map((f) => f.orgId) as string[]

  const candidates = await db.event.findMany({
    where: { ...PUBLIC_EVENT_WHERE, startsAt: { gte: now }, status: { in: ['PUBLISHED', 'LIVE'] }, id: attendedIds.length ? { notIn: attendedIds } : undefined },
    orderBy: { startsAt: 'asc' },
    take: 24,
    select: { ...eventCardSelect, description: true },
  })
  if (candidates.length === 0) return { items: [], reasons: {}, degraded: false, note: 'You are all caught up — no upcoming events left to suggest.' }

  const summarize = (e: (typeof candidates)[number]) =>
    `- id=${e.id} | "${e.title}" | category=${e.categorySlug} | city=${e.city ?? 'online'} | ${e.mode.toLowerCase()} | ${e.startsAt.toUTCString()} | org=${e.org.name}${e.summary ? ` | ${e.summary.slice(0, 90)}` : ''}`

  const hasHistory = favCategories.length + favCities.length + favOrgIds.length + followedOrgIds.length > 0
  if (!hasHistory) {
    // Honest fallback: popularity by real tickets sold (no LLM personalization invented).
    const trending = [...candidates]
      .sort((a, b) => b.ticketTypes.reduce((s, t) => s + t.soldCount, 0) - a.ticketTypes.reduce((s, t) => s + t.soldCount, 0))
      .slice(0, 4)
    return { items: trending, reasons: {}, degraded: true, note: null }
  }

  try {
    const system = [
      'You are the iEventPlux recommendation engine. Pick the 4 upcoming events a specific attendee is MOST likely to enjoy.',
      'Respond with ONLY JSON: {"picks": [{"id": string, "reason": string}]}. reason = one sentence (max 90 chars) explaining the pick using their history. Never invent events.',
      `The attendee's history: favorite categories: ${favCategories.join(', ') || 'none'}; cities they attended: ${favCities.join(', ') || 'none'}; organizers they follow: ${followedOrgIds.concat(favOrgIds).join(', ') || 'none'}.`,
      'Prefer matching categories/cities and followed organizers; keep variety (no more than 2 from the same category).',
    ].join('\n')
    const parsed = await llmJson<{ picks?: { id?: string; reason?: string }[] }>(system, candidates.map(summarize).join('\n'))
    const byId = new Map(candidates.map((c) => [c.id, c]))
    const reasons: Record<string, string> = {}
    const picked = (parsed.picks ?? [])
      .filter((p) => typeof p.id === 'string' && byId.has(p.id))
      .slice(0, 4)
      .map((p) => {
        reasons[p.id as string] = String(p.reason ?? '').slice(0, 120) || 'Matches your event history.'
        return byId.get(p.id as string)
      })
      .filter(Boolean) as typeof candidates
    if (picked.length === 0) throw new Error('no valid picks')
    // Top up with real candidates if the model returned fewer than 3 picks.
    if (picked.length < 3) {
      for (const c of candidates) {
        if (picked.length >= 4) break
        if (!picked.some((p) => p.id === c.id)) picked.push(c)
      }
    }
    return { items: picked, reasons, degraded: false, note: null }
  } catch {
    const trending = [...candidates]
      .sort((a, b) => b.ticketTypes.reduce((s, t) => s + t.soldCount, 0) - a.ticketTypes.reduce((s, t) => s + t.soldCount, 0))
      .slice(0, 4)
    return { items: trending, reasons: {}, degraded: true, note: null }
  }
}

// ── AI studio: organizer copywriting + poster generation ─────────────────────

async function runStudio(userId: string, body: Record<string, unknown>) {
  const kind = String(body.kind ?? '')
  const str = (key: string, max = 300) => sanitizeText(body[key], max)
  const title = str('title', 140)
  if (kind !== 'poster' && title.length < 2) throw errors.badRequest('Event title is required.')

  if (kind === 'description') {
    const system = [
      'You write event descriptions for iEventPlux, a Ghanaian events platform (currency ₵).',
      'Respond with ONLY JSON: {"summary": string, "description": string, "tags": string[]}.',
      'summary: max 180 chars, plain text, compelling. description: 3-5 short markdown paragraphs (no headings level 1; use **bold** sparingly), warm professional tone, end with a call to action. tags: 3-6 lowercase topic tags.',
      'Ground every detail ONLY in the provided brief — never invent dates, prices, performers or venues.',
    ].join('\n')
    const brief = [
      `Title: ${title}`,
      body.category ? `Category: ${str('category', 40)}` : '',
      body.city ? `City/venue: ${str('city', 120)}` : '',
      body.dateText ? `Date/time: ${str('dateText', 80)}` : '',
      body.audience ? `Audience: ${str('audience', 200)}` : '',
      body.tone ? `Tone: ${str('tone', 40)}` : '',
      body.notes ? `Organizer notes: ${str('notes', 1200)}` : '',
    ].filter(Boolean).join('\n')
    const out = await llmJson<{ summary?: string; description?: string; tags?: unknown }>(system, brief)
    const tags = Array.isArray(out.tags) ? out.tags.filter((t) => typeof t === 'string').slice(0, 8) : []
    return {
      summary: String(out.summary ?? '').slice(0, 200),
      description: String(out.description ?? '').slice(0, 4000),
      tags,
    }
  }

  if (kind === 'captions') {
    const system = [
      'You write social launch captions for events on iEventPlux (Ghana, currency ₵).',
      'Respond with ONLY JSON: {"whatsapp": string, "x": string, "instagram": string}.',
      'whatsapp: warm broadcast message with emojis, max 500 chars. x: punchy, max 250 chars, 1-2 hashtags. instagram: caption + 4-6 hashtags, max 900 chars.',
      'Use only provided facts. Always end with a call to action to get tickets on iEventPlux.',
    ].join('\n')
    const brief = [
      `Event: ${title}`,
      body.dateText ? `Date/time: ${str('dateText', 80)}` : '',
      body.city ? `Location: ${str('city', 120)}` : '',
      body.highlights ? `Highlights: ${str('highlights', 800)}` : '',
      body.link ? `Ticket link: ${str('link', 200)}` : '',
    ].filter(Boolean).join('\n')
    const out = await llmJson<{ whatsapp?: string; x?: string; instagram?: string }>(system, brief)
    return {
      whatsapp: String(out.whatsapp ?? '').slice(0, 800),
      x: String(out.x ?? '').slice(0, 280),
      instagram: String(out.instagram ?? '').slice(0, 1000),
    }
  }

  if (kind === 'poster') {
    const vibe = str('vibe', 120) || 'modern, vibrant, professional'
    const palette = str('palette', 120) || 'emerald green and warm gold accents on deep charcoal'
    const prompt = [
      'Professional event poster design, portrait orientation, eye-catching composition with clear visual hierarchy.',
      title ? `Event title text "${title}" as the dominant headline.` : '',
      str('dateText', 80) ? `Include the date text "${str('dateText', 80)}".` : '',
      str('city', 120) ? `Include location text "${str('city', 120)}".` : '',
      `Style: ${vibe}. Color palette: ${palette}.`,
      'High-quality graphic design, poster layout with decorative shapes and depth, no watermark, no stock-photo people faces in focus.',
    ].filter(Boolean).join(' ')
    const zai = await llmClient()
    const image = await zai.images.generations.create({ prompt: prompt.slice(0, 1900), size: '864x1152' })
    const base64 = image?.data?.[0]?.base64
    if (!base64) throw errors.unavailable('AI_IMAGE_UNAVAILABLE', 'Poster generation is unavailable right now. Please try again.')
    return { imageBase64: base64, mimeType: 'image/png' }
  }

  throw errors.badRequest('Unknown studio kind. Use description, captions or poster.')
}

// ── Router ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { mode } = await ctx.params
    if (!env.aiEnabled) throw errors.unavailable('AI_DISABLED', 'The AI concierge is disabled on this deployment.')

    if (mode === 'search') {
      rateLimit(req, 'ai-search', 12, 60_000)
      const body = await readJson<{ query?: string }>(req)
      const query = sanitizeText(body.query, 300)
      if (query.length < 3) throw errors.badRequest('Describe what you are looking for (at least 3 characters).')
      const result = await runSmartSearch(query)
      return jsonOk(result)
    }

    if (mode === 'recommend') {
      rateLimit(req, 'ai-recommend', 10, 60_000)
      const user = await requireUser()
      const result = await runRecommendations(user.id)
      return jsonOk(result)
    }

    if (mode === 'studio') {
      rateLimit(req, 'ai-studio', 15, 60_000)
      const user = await requireUser()
      const body = await readJson<Record<string, unknown>>(req)
      const result = await runStudio(user.id, body)
      return jsonOk(result)
    }

    const user = await requireUser()
    const system = await buildConciergeContext()

    if (mode === 'chat') {
      rateLimit(req, 'ai-chat', 20, 60_000)
      const body = (await req.json().catch(() => ({}))) as { message?: string; conversationId?: string }
      const message = sanitizeText(body.message, 1000)
      if (message.length < 2) throw errors.badRequest('Message is required.')
      const conversationId = await ensureConversation(user.id, 'TEXT', body.conversationId)
      const history = await db.aiMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, take: 20 })
      await db.aiMessage.create({ data: { conversationId, role: 'USER', text: message } })
      const reply = await llmReply(system, [...history.map((h) => ({ role: h.role, content: h.text })), { role: 'user', content: message }])
      await db.aiMessage.create({ data: { conversationId, role: 'ASSISTANT', text: reply } })
      return jsonOk({ conversationId, reply })
    }

    if (mode === 'voice') {
      rateLimit(req, 'ai-voice', 12, 60_000)
      const form = await req.formData().catch(() => null)
      if (!form) throw errors.badRequest('Multipart form with an audio field is required.')
      const audio = form.get('audio')
      const conversationIdField = form.get('conversationId')
      if (!(audio instanceof File)) throw errors.badRequest('An audio file is required.')
      if (audio.size > 8 * 1024 * 1024) throw errors.badRequest('Audio too large (max 8MB).')

      const transcript = await transcribe(await audio.arrayBuffer())
      if (!transcript) {
        return jsonOk({ transcript: '', reply: '', audioBase64: null, note: 'No speech detected. Try speaking a bit longer.', conversationId: conversationIdField ? String(conversationIdField) : null })
      }
      const conversationId = await ensureConversation(user.id, 'VOICE', conversationIdField ? String(conversationIdField) : undefined)
      const history = await db.aiMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, take: 12 })
      await db.aiMessage.create({ data: { conversationId, role: 'USER', text: transcript } })
      const reply = await llmReply(system, [...history.map((h) => ({ role: h.role, content: h.text })), { role: 'user', content: transcript }])
      await db.aiMessage.create({ data: { conversationId, role: 'ASSISTANT', text: reply } })
      const audioBase64 = await ttsBase64(reply)
      return jsonOk({
        transcript,
        reply,
        audioBase64,
        audioMime: audioBase64 ? 'audio/wav' : null,
        conversationId,
        ttsNote: audioBase64 ? null : 'Voice synthesis unavailable for this reply — showing text only.',
      })
    }

    throw errors.notFound('Unknown AI mode.')
  })
}
