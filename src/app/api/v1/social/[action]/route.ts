import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, sanitizeText, jsonList, pagination } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'

/**
 * Social endpoints: follow | unfollow | interest | feed | saved | block | mute | report
 */

type RouteContext = { params: Promise<{ action: string }> }

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { action } = await ctx.params
    const user = await requireUser()
    const body = await readJson<Record<string, unknown>>(req)

    if (action === 'follow' || action === 'unfollow') {
      const orgId = body.orgId ? String(body.orgId) : null
      const userId = body.userId ? String(body.userId) : null
      if (!orgId && !userId) throw errors.badRequest('Specify an organization or user to follow.')
      if (userId === user.id) throw errors.badRequest('You cannot follow yourself.')
      if (action === 'follow') {
        await db.follow.upsert({
          where: orgId ? { followerId_orgId: { followerId: user.id, orgId } } : { followerId_userId: { followerId: user.id, userId: userId as string } },
          create: orgId ? { followerId: user.id, orgId } : { followerId: user.id, userId: userId as string },
          update: {},
        })
      } else {
        if (orgId) await db.follow.deleteMany({ where: { followerId: user.id, orgId } })
        else await db.follow.deleteMany({ where: { followerId: user.id, userId: userId as string } })
      }
      return jsonOk({ following: action === 'follow' })
    }

    if (action === 'interest') {
      const eventId = String(body.eventId ?? '')
      const kind = ['SAVE', 'INTEREST', 'GOING'].includes(String(body.kind)) ? String(body.kind) : 'SAVE'
      const privacy = ['PUBLIC', 'FOLLOWERS', 'PRIVATE'].includes(String(body.privacy)) ? String(body.privacy) : 'PUBLIC'
      const event = await db.event.findUnique({ where: { id: eventId } })
      if (!event) throw errors.notFound('Event not found.')
      if (String(body.remove) === 'true') {
        await db.eventInterest.deleteMany({ where: { userId: user.id, eventId, kind } })
        return jsonOk({ removed: true })
      }
      await db.eventInterest.upsert({
        where: { userId_eventId_kind: { userId: user.id, eventId, kind } },
        create: { userId: user.id, eventId, kind, privacy },
        update: { privacy },
      })
      return jsonOk({ kind, privacy })
    }

    if (action === 'reaction') {
      await rateLimit(req, 'reaction', 30, 60_000)
      const targetType = String(body.targetType ?? 'MEDIA')
      const targetId = String(body.targetId ?? '')
      const kind = ['LIKE', 'CELEBRATE', 'HEART', 'FIRE'].includes(String(body.kind)) ? String(body.kind) : 'LIKE'
      if (!targetId) throw errors.badRequest('Missing target.')
      const existing = await db.reaction.findFirst({ where: { targetType, targetId, userId: user.id } })
      if (existing) {
        if (existing.kind === kind) {
          await db.reaction.delete({ where: { id: existing.id } })
          return jsonOk({ reacted: false })
        }
        await db.reaction.update({ where: { id: existing.id }, data: { kind } })
        return jsonOk({ reacted: true, kind })
      }
      await db.reaction.create({ data: { targetType, targetId, userId: user.id, kind } })
      if (targetType === 'MEDIA') {
        await db.mediaAsset.update({ where: { id: targetId }, data: { views: { increment: 1 } } }).catch(() => {})
      }
      return jsonOk({ reacted: true, kind })
    }

    if (action === 'report') {
      await rateLimit(req, 'report', 5, 60_000)
      const targetType = ['EVENT', 'COMMENT', 'USER', 'ORG', 'BROADCAST'].includes(String(body.targetType)) ? String(body.targetType) : null
      if (!targetType) throw errors.badRequest('Invalid report target.')
      const report = await db.moderationReport.create({
        data: {
          reporterId: user.id,
          targetType,
          targetId: String(body.targetId ?? ''),
          reason: ['SPAM', 'OFFENSIVE', 'FRAUD', 'COPYRIGHT', 'OTHER'].includes(String(body.reason)) ? String(body.reason) : 'OTHER',
          details: sanitizeText(body.details, 1000) || null,
        },
      })
      return jsonOk({ report })
    }

    if (action === 'block' || action === 'mute') {
      const other = String(body.userId ?? '')
      if (!other || other === user.id) throw errors.badRequest('Invalid target user.')
      if (action === 'block') {
        await db.userBlock.upsert({ where: { blockerId_blockedId: { blockerId: user.id, blockedId: other } }, create: { blockerId: user.id, blockedId: other }, update: {} })
      } else {
        await db.userMute.upsert({ where: { muterId_mutedId: { muterId: user.id, mutedId: other } }, create: { muterId: user.id, mutedId: other }, update: {} })
      }
      return jsonOk({ ok: true })
    }

    if (action === 'notifications-read') {
      if (String(body.all) === 'true') {
        await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } })
        return jsonOk({ ok: true })
      }
      const id = String(body.id ?? '')
      await db.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } })
      return jsonOk({ ok: true })
    }

    throw errors.notFound('Unknown social action.')
  })
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { action } = await ctx.params

    if (action === 'feed') {
      const session = await getSession()
      if (!session) throw errors.unauthorized()
      const follows = await db.follow.findMany({ where: { followerId: session.user.id }, select: { orgId: true, userId: true } })
      const orgIds = follows.map((f) => f.orgId).filter((v): v is string => Boolean(v))
      const { page, pageSize, offset } = pagination(req, 12, 36)
      const where = {
        visibility: 'PUBLIC', deletedAt: null, status: { in: ['PUBLISHED', 'LIVE', 'POSTPONED'] },
        OR: [...(orgIds.length ? [{ orgId: { in: orgIds } }] : []), { isFeatured: true }],
      }
      const items = await db.event.findMany({
        where, orderBy: { startsAt: 'asc' }, skip: offset, take: pageSize,
        select: { id: true, slug: true, title: true, summary: true, coverImageUrl: true, startsAt: true, city: true, mode: true, org: { select: { name: true, slug: true } }, ticketTypes: { select: { priceMinor: true }, where: { active: true } } },
      })
      const total = await db.event.count({ where })
      return jsonList(items, total, page, pageSize)
    }

    if (action === 'saved') {
      const session = await getSession()
      if (!session) throw errors.unauthorized()
      const items = await db.eventInterest.findMany({
        where: { userId: session.user.id },
        include: { event: { select: { id: true, slug: true, title: true, coverImageUrl: true, startsAt: true, city: true, mode: true, status: true, org: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 60,
      })
      return jsonOk({ items })
    }

    if (action === 'following') {
      const session = await getSession()
      if (!session) throw errors.unauthorized()
      const follows = await db.follow.findMany({
        where: { followerId: session.user.id },
        include: { org: { select: { id: true, name: true, slug: true, tagline: true, verifiedAt: true } }, targetUser: { select: { id: true, displayName: true } } },
      })
      return jsonOk({ items: follows })
    }

    if (action === 'notifications') {
      const session = await getSession()
      if (!session) throw errors.unauthorized()
      const { page, pageSize, offset } = pagination(req, 20, 50)
      const items = await db.notification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, skip: offset, take: pageSize })
      const unread = await db.notification.count({ where: { userId: session.user.id, readAt: null } })
      return jsonList(items, items.length + unread, page, pageSize, )
    }

    throw errors.notFound('Unknown social endpoint.')
  })
}
