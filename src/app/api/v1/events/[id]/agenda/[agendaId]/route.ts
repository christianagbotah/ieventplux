import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit } from '@/server/api'
import { eventOrgAccess } from '@/server/permissions'
import { agendaItemPayload } from '@/server/event-agenda-policy'
import { db } from '@/lib/db'

type Context = { params: Promise<{ id: string; agendaId: string }> }

/** Organizer-only agenda editing. Always scope both item and event IDs. */
export async function PATCH(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id, agendaId } = await ctx.params
    await rateLimit(req, 'event-operations-author', 40, 60_000)
    const user = await requireUser()
    const access = await eventOrgAccess(user.id, id, 'event:edit')
    if (!access.event) throw errors.notFound('Event not found.')
    if (!access.allowed) throw errors.forbidden('Agenda editing requires event manager access.')
    const previous = await db.agendaItem.findFirst({ where: { id: agendaId, eventId: id } })
    if (!previous) throw errors.notFound('Agenda item not found.')
    const patch = await readJson<Record<string, unknown>>(req)
    const data = agendaItemPayload({ ...previous, ...patch })
    const result = await db.agendaItem.updateMany({ where: { id: agendaId, eventId: id }, data })
    if (!result.count) throw errors.notFound('Agenda item not found.')
    const item = await db.agendaItem.findFirst({ where: { id: agendaId, eventId: id } })
    return jsonOk({ item })
  })
}

export async function DELETE(req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id, agendaId } = await ctx.params
    await rateLimit(req, 'event-operations-author', 40, 60_000)
    const user = await requireUser()
    const access = await eventOrgAccess(user.id, id, 'event:edit')
    if (!access.event) throw errors.notFound('Event not found.')
    if (!access.allowed) throw errors.forbidden('Removing agenda slots requires event manager access.')
    const result = await db.agendaItem.deleteMany({ where: { id: agendaId, eventId: id } })
    if (!result.count) throw errors.notFound('Agenda item not found.')
    return jsonOk({ deleted: true })
  })
}
