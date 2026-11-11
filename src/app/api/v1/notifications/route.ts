import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, jsonList, pagination } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'

/** Notifications for the signed-in user. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    void req
    const session = await getSession()
    if (!session) return jsonOk({ items: [], unread: 0 })
    const { page, pageSize, offset } = pagination(req, 20, 50)
    const items = await db.notification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, skip: offset, take: pageSize })
    const unread = await db.notification.count({ where: { userId: session.user.id, readAt: null } })
    return jsonOk({ items, unread, page, pageSize })
  })
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    const body = await readJson<{ all?: boolean; id?: string }>(req)
    if (body.all) {
      await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } })
      return jsonOk({ ok: true })
    }
    if (body.id) {
      await db.notification.updateMany({ where: { id: String(body.id), userId: user.id }, data: { readAt: new Date() } })
      return jsonOk({ ok: true })
    }
    throw errors.badRequest('Specify a notification id or all=true.')
  })
}
