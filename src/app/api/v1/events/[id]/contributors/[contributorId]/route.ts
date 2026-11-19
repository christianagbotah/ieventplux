import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors } from '@/server/api'
import { eventOrgAccess } from '@/server/permissions'
import { contributorPayload } from '@/server/event-programme-policy'
import { db } from '@/lib/db'

type Context = { params: Promise<{ id: string; contributorId: string }> }
export async function PATCH(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id, contributorId } = await ctx.params
    const user = await requireUser()
    const access = await eventOrgAccess(user.id, id, 'event:edit')
    if (!access.allowed) throw errors.forbidden('Lineup editing requires event-manager permission.')
    const previous = await db.eventContributor.findFirst({ where: { id: contributorId, eventId: id } })
    if (!previous) throw errors.notFound('Lineup participant not found.')
    const body = await readJson<Record<string, unknown>>(req)
    const data = contributorPayload({ ...previous, ...body })
    return jsonOk({ item: await db.eventContributor.update({ where: { id: previous.id }, data }) })
  })
}
export async function DELETE(_req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id, contributorId } = await ctx.params
    const user = await requireUser()
    const access = await eventOrgAccess(user.id, id, 'event:edit')
    if (!access.allowed) throw errors.forbidden('Lineup editing requires event-manager permission.')
    const result = await db.eventContributor.deleteMany({ where: { id: contributorId, eventId: id } })
    if (!result.count) throw errors.notFound('Lineup participant not found.')
    return jsonOk({ deleted: true })
  })
}
