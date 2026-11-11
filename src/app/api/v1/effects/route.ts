import { NextRequest } from 'next/server'
import { handle, jsonOk, errors, requireUser } from '@/server/api'
import { db } from '@/lib/db'
import { cssEffects } from '@/data/css-effects'

/**
 * CSS Effects Library API — the catalog source of truth is src/data/css-effects.ts
 * (verified, self-contained, scoped CSS). This endpoint adds search/filter and
 * DB-backed view counters.
 */

export async function GET(req: NextRequest) {
  return handle(async () => {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').toLowerCase().trim()
    const category = url.searchParams.get('category')
    const difficulty = url.searchParams.get('difficulty')
    const kind = url.searchParams.get('demoKind')

    let items = cssEffects
    if (category) items = items.filter((e) => e.category === category)
    if (difficulty) items = items.filter((e) => e.difficulty === difficulty)
    if (kind) items = items.filter((e) => e.demoKind === kind)
    if (q) {
      items = items.filter(
        (e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    // Attach view counters from the DB (falls back to 0 without DB rows).
    const stats = await db.cSSEffect.findMany({ select: { id: true, views: true, featured: true } }).catch(() => [] as { id: string; views: number; featured: boolean }[])
    const statsMap = new Map(stats.map((s) => [s.id, s]))

    const categories = [...new Set(cssEffects.map((e) => e.category))]

    return jsonOk({
      total: items.length,
      categories,
      items: items.map((e) => ({ ...e, views: statsMap.get(e.id)?.views ?? 0, featured: statsMap.get(e.id)?.featured ?? false })),
    })
  })
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug')
    if (!slug) throw errors.badRequest('slug is required.')
    const effect = cssEffects.find((e) => e.id === slug)
    if (!effect) throw errors.notFound('Effect not found.')
    await requireUser().catch(() => null) // views count for anonymous users too
    await db.cSSEffect
      .upsert({ where: { id: slug }, create: { id: slug, name: effect.name, category: effect.category, difficulty: effect.difficulty, demoKind: effect.demoKind, views: 1 }, update: { views: { increment: 1 } } })
      .catch(() => {})
    return jsonOk({ ok: true })
  })
}
