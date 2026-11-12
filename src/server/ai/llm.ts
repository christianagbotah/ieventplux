import { errors } from '../api'

/**
 * Shared LLM plumbing (round 14 refactor): every AI surface uses the same
 * client construction, JSON extraction and reply shaping so retries, thinking
 * mode and size limits stay consistent. The z-ai-web-dev-sdk is server-only.
 */

export async function llmClient() {
  const ZAI = (await import('z-ai-web-dev-sdk')).default
  return ZAI.create()
}

export async function llmReply(system: string, history: { role: string; content: string }[]): Promise<string> {
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
export function extractJson<T>(raw: string): T {
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

export async function llmJson<T>(system: string, userPrompt: string): Promise<T> {
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
