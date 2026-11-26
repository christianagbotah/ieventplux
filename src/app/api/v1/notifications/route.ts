import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'
import { publishNotificationRead } from '@/server/services/notify'

/** Notifications for the signed-in user. */
const privateHeaders = { 'Cache-Control': 'private, no-store' }

export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession()
    if (!session) return jsonOk({ items: [], unread: 0, hasMore: false }, { headers: privateHeaders })
    const params = req.nextUrl.searchParams
    const page = Number(params.get('page') ?? '1')
    const pageSize = Number(params.get('pageSize') ?? '20')
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) throw errors.badRequest('Invalid notification page.')
    const before = params.get('before')
    if (before !== null && (!before || before.length > 128 || page !== 1)) throw errors.badRequest('Invalid notification cursor.')
    const userId = session.user.id
    const anchor = before ? await db.notification.findFirst({ where: { id: before, userId }, select: { id: true, createdAt: true } }) : null
    if (before && !anchor) throw errors.badRequest('Invalid notification cursor.')
    const items = await db.notification.findMany({
      where: { userId, ...(anchor ? { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: before ? 0 : (page - 1) * pageSize,
      take: pageSize + 1,
    })
    const unread = await db.notification.count({ where: { userId: session.user.id, readAt: null } })
    return jsonOk({ items: items.slice(0, pageSize), unread, page, pageSize, hasMore: items.length > pageSize, nextCursor: items.length > pageSize ? items[pageSize - 1]?.id ?? null : null }, { headers: privateHeaders })
  })
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    const body = await readJson<{ all?: boolean; id?: string }>(req)
    if (body.all) {
      await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } })
      await publishNotificationRead(user.id)
      return jsonOk({ ok: true }, { headers: privateHeaders })
    }
    if (body.id) {
      await db.notification.updateMany({ where: { id: String(body.id), userId: user.id, readAt: null }, data: { readAt: new Date() } })
      await publishNotificationRead(user.id)
      return jsonOk({ ok: true }, { headers: privateHeaders })
    }
    throw errors.badRequest('Specify a notification id or all=true.')
  })
}
