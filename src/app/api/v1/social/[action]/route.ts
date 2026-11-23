import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, rateLimit, sanitizeText, jsonList, pagination } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'
import {
  cursorForFollowingRow, decodeFollowingCursor, followingOrgIds,
  followingSourceSeek, sortFollowingRows,
} from '@/server/following-feed-policy'

/**
 * Social endpoints: follow | unfollow | interest | feed | saved | block | mute | report
 */

type RouteContext = { params: Promise<{ action: string }> }

/** Common public-event projection for followed organizer activities. */
const followingEventSelect = {
  id: true, slug: true, title: true, summary: true, coverImageUrl: true,
  startsAt: true, endsAt: true, city: true, country: true, mode: true,
  status: true, categorySlug: true, createdAt: true,
  org: { select: { name: true, slug: true, verifiedAt: true } },
  ticketTypes: {
    where: { active: true },
    select: { priceMinor: true, currency: true, soldCount: true, quota: true },
  },
} as const



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
      if (orgId && userId) throw errors.badRequest('Follow either an organizer or a user, not both.')
      if (action === 'follow') {
        // A forged ID must not create a follow relationship with hidden,
        // suspended or removed organizer profiles.
        const target = orgId
          ? await db.organization.findFirst({
              where: { id: orgId, deletedAt: null, status: 'ACTIVE' },
              select: { ownerId: true },
            })
          : await db.user.findFirst({
              where: { id: userId as string, status: 'ACTIVE', deletedAt: null },
              select: { id: true },
            })
        if (!target) throw errors.notFound('This profile is unavailable to follow.')
        const ownerId = orgId ? ('ownerId' in target ? target.ownerId : null) : userId
        if (ownerId === user.id) throw errors.badRequest('You already manage this organizer. You cannot follow yourself.')
        if (ownerId && ownerId !== user.id) {
          const blocked = await db.userBlock.findFirst({
            where: { OR: [
              { blockerId: user.id, blockedId: ownerId },
              { blockerId: ownerId, blockedId: user.id },
            ] }, select: { blockerId: true },
          })
          if (blocked) throw errors.forbidden('This profile cannot be followed.')
        }
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
      const url = new URL(req.url)
      const { pageSize } = pagination(req, 12, 24)
      let cursor
      try { cursor = decodeFollowingCursor(url.searchParams.get('cursor')) }
      catch { throw errors.badRequest('Invalid feed cursor. Refresh your Following feed.') }

      const userId = session.user.id
      const [follows, blocks, mutes] = await Promise.all([
        db.follow.findMany({
          where: { followerId: userId, orgId: { not: null }, org: { deletedAt: null, status: 'ACTIVE' } },
          select: { orgId: true, org: { select: { ownerId: true } } },
        }),
        db.userBlock.findMany({
          where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
          select: { blockerId: true, blockedId: true },
        }),
        db.userMute.findMany({ where: { muterId: userId }, select: { mutedId: true } }),
      ])
      const excludedOwners = new Set([
        ...blocks.map((block) => block.blockerId === userId ? block.blockedId : block.blockerId),
        ...mutes.map((mute) => mute.mutedId),
      ])
      const orgIds = followingOrgIds(
        follows.map((follow) => ({ orgId: follow.orgId, ownerId: follow.org?.ownerId ?? null })),
        excludedOwners,
      )

      // A Following feed contains followed organizers ONLY. No unrelated
      // featured/sponsored events, private drafts, unlisted or invitation events.
      if (orgIds.length === 0) {
        const result = jsonOk({ items: [], hasMore: false, nextCursor: null, followingCount: 0 })
        result.headers.set('Cache-Control', 'private, no-store')
        return result
      }

      const publicEvent = {
        orgId: { in: orgIds }, visibility: 'PUBLIC', deletedAt: null,
        status: { in: ['PUBLISHED', 'LIVE', 'POSTPONED'] },
      }
      const eventSeek = followingSourceSeek('EVENT', cursor)
      const updateSeek = followingSourceSeek('UPDATE', cursor)
      const [events, updates] = await Promise.all([
        db.event.findMany({
          where: { ...publicEvent, ...eventSeek },
          select: followingEventSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: pageSize + 1,
        }),
        db.eventUpdate.findMany({
          where: {
            orgId: { in: orgIds },
            event: publicEvent,
            ...updateSeek,
          },
          select: { id: true, title: true, body: true, important: true, createdAt: true, event: { select: followingEventSelect } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: pageSize + 1,
        }),
      ])
      const timeline = sortFollowingRows([
        ...events.map((event) => ({
          id: event.id, kind: 'EVENT' as const, activityAt: event.createdAt.toISOString(),
          title: event.title, body: event.summary, important: false,
          event: { ...event, createdAt: undefined },
        })),
        ...updates.map((update) => ({
          id: update.id, kind: 'UPDATE' as const, activityAt: update.createdAt.toISOString(),
          title: update.title, body: update.body, important: update.important,
          event: { ...update.event, createdAt: undefined },
        })),
      ])
      const page = timeline.slice(0, pageSize)
      const hasMore = timeline.length > pageSize
      const result = jsonOk({
        items: page,
        hasMore,
        nextCursor: hasMore && page.length > 0 ? cursorForFollowingRow(page[page.length - 1]) : null,
        followingCount: orgIds.length,
      })
      result.headers.set('Cache-Control', 'private, no-store')
      return result
    }

    if (action === 'saved') {
      const session = await getSession()
      if (!session) throw errors.unauthorized()
      const items = await db.eventInterest.findMany({
        where: { userId: session.user.id, kind: { in: ['SAVE', 'INTEREST', 'GOING'] } },
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
