import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit } from '@/server/api'
import { eventOrgAccess } from '@/server/permissions'
import { canViewProgramme } from '@/server/event-operations-access'
import { contributorPayload } from '@/server/event-programme-policy'
import { db } from '@/lib/db'

type Context = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id } = await ctx.params
    const { member } = await canViewProgramme(id)
    const entries = await db.eventContributor.findMany({
      where: { eventId: id, ...(member ? {} : { published: true }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], take: 150,
    })
    return jsonOk({ items: entries }, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}

export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id } = await ctx.params
    await rateLimit(req, 'event-operations-author', 40, 60_000)
    const user = await requireUser()
    const access = await eventOrgAccess(user.id, id, 'event:edit')
    if (!access.event) throw errors.notFound('Event not found.')
    if (!access.allowed) throw errors.forbidden('Only an authorized organizer can edit the lineup.')
    const count = await db.eventContributor.count({ where: { eventId: id } })
    if (count >= 150) throw errors.conflict('Limit reached: 150 people per event.')
    const data = contributorPayload(await readJson<Record<string, unknown>>(req))
    return jsonOk({ item: await db.eventContributor.create({ data: { eventId: id, ...data } }) })
  })
}
