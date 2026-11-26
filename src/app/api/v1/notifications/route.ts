import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, pagination } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'

/** Notifications for the signed-in user. */
const privateHeaders = { 'Cache-Control': 'private, no-store' }

export async function GET(req: NextRequest) {
  return handle(async () => {
    void req
    const session = await getSession()
    if (!session) return jsonOk({ items: [], unread: 0, hasMore: false }, { headers: privateHeaders })
    const { page, pageSize, offset } = pagination(req, 20, 50)
    const items = await db.notification.findMany({ where: { userId: session.user.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: offset, take: pageSize + 1 })
    const unread = await db.notification.count({ where: { userId: session.user.id, readAt: null } })
    return jsonOk({ items: items.slice(0, pageSize), unread, page, pageSize, hasMore: items.length > pageSize }, { headers: privateHeaders })
  })
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    const body = await readJson<{ all?: boolean; id?: string }>(req)
    if (body.all) {
      await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } })
      return jsonOk({ ok: true }, { headers: privateHeaders })
    }
    if (body.id) {
      await db.notification.updateMany({ where: { id: String(body.id), userId: user.id }, data: { readAt: new Date() } })
      return jsonOk({ ok: true }, { headers: privateHeaders })
    }
    throw errors.badRequest('Specify a notification id or all=true.')
  })
}
