import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors, rateLimit, sanitizeText } from '@/server/api'
import { db } from '@/lib/db'
import { env } from '@/server/env'
import { formatMoney } from '@/server/money'

/**
 * AI concierge (brief §7 — optional AI assistance remains nonessential to core workflows):
 *  POST /api/v1/ai/chat  { message, conversationId? } → text reply with REAL event context
 *  POST /api/v1/ai/voice (multipart: audio)           → real-time voice conversation turn:
 *                                                         ASR → LLM (DB context) → TTS audio back.
 * The z-ai-web-dev-sdk runs server-side only.
 */

type RouteContext = { params: Promise<{ mode: string }> }

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

async function llmReply(system: string, history: { role: string; content: string }[]): Promise<string> {
  const ZAI = (await import('z-ai-web-dev-sdk')).default
  const zai = await ZAI.create()
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

async function ttsBase64(text: string): Promise<string | null> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const clipped = text.slice(0, 1000) // SDK limit: 1024 chars
    const response = await zai.audio.tts.create({
      input: clipped,
      voice: 'tongtong',
      speed: 1.0,
      response_format: 'mp3',
      stream: false,
    })
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(new Uint8Array(arrayBuffer)).toString('base64')
  } catch {
    return null // voice reply degrades to text; never fake audio
  }
}

async function transcribe(buffer: ArrayBuffer): Promise<string> {
  const ZAI = (await import('z-ai-web-dev-sdk')).default
  const zai = await ZAI.create()
  const response = await zai.audio.asr.create({
    file_base64: Buffer.from(new Uint8Array(buffer)).toString('base64'),
  })
  return (response.text ?? '').trim()
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

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { mode } = await ctx.params
    if (!env.aiEnabled) throw errors.unavailable('AI_DISABLED', 'The AI concierge is disabled on this deployment.')
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
        audioMime: audioBase64 ? 'audio/mpeg' : null,
        conversationId,
        ttsNote: audioBase64 ? null : 'Voice synthesis unavailable for this reply — showing text only.',
      })
    }

    throw errors.notFound('Unknown AI mode.')
  })
}
