import { createHash } from 'node:crypto'
import { db } from '../../src/lib/db'
import { canJoinRoom, parseRoomKey } from './room-authorization'

const SESSION_COOKIE = 'ievx_session'

function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null
  const pair = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(SESSION_COOKIE + '='))
  if (!pair) return null
  const encoded = pair.slice(SESSION_COOKIE.length + 1)
  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

export async function activeUserId(cookieHeader: string | undefined): Promise<string | null> {
  const token = readSessionCookie(cookieHeader)
  if (!token) return null
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const session = await db.session.findUnique({
    where: { tokenHash },
    select: {
      userId: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { status: true, deletedAt: true } },
    },
  })
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null
  if (session.user.status !== 'ACTIVE' || session.user.deletedAt) return null
  return session.userId
}

async function acceptedOrgMember(userId: string, orgId: string): Promise<boolean> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { ownerId: true, status: true, deletedAt: true } })
  if (!org || org.deletedAt || org.status !== 'ACTIVE') return false
  if (org.ownerId === userId) return true
  const member = await db.membership.findFirst({
    where: { userId, orgId, acceptedAt: { not: null } },
    select: { id: true },
  })
  return Boolean(member)
}

/** Checks server-owned records; only the room key comes from the socket. */
export async function mayJoinRealtimeRoom(rawRoom: unknown, cookieHeader: string | undefined): Promise<boolean> {
  const room = parseRoomKey(rawRoom)
  if (!room) return false

  const userId = await activeUserId(cookieHeader)
  if (room.kind === 'user') return canJoinRoom(room, userId)

  if (room.kind === 'meeting' || room.kind === 'meeting-chat') {
    if (!userId) return false
    const { getMeetingAccess, meetingFeatureEnabled } = await import('../../src/server/meeting-service')
    if (!meetingFeatureEnabled()) return false
    try {
      const access = await getMeetingAccess(room.id, userId)
      return canJoinRoom(room, userId, {
        liveMeeting: access.canJoin,
        meetingChat: access.meeting.chatEnabled,
        orgMember: access.organizer,
        validTicket: access.attendee,
      })
    } catch {
      return false
    }
  }

  if (room.kind === 'broadcast') {
    if (!userId) return false
    const broadcast = await db.liveBroadcast.findUnique({
      where: { id: room.id },
      select: { event: { select: { orgId: true, status: true, deletedAt: true, org: { select: { status: true, deletedAt: true } } } } },
    })
    if (!broadcast || broadcast.event.deletedAt || broadcast.event.org.deletedAt || broadcast.event.org.status !== 'ACTIVE') return false
    if (await acceptedOrgMember(userId, broadcast.event.orgId)) {
      return canJoinRoom(room, userId, { orgMember: true })
    }
    if (!['PUBLISHED', 'LIVE', 'ENDED'].includes(broadcast.event.status)) return false
    const activePlayback = await db.playbackSession.findFirst({
      where: {
        broadcastId: room.id,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    })
    return canJoinRoom(room, userId, { activePlayback: Boolean(activePlayback) })
  }

  const event = await db.event.findUnique({
    where: { id: room.id },
    select: { orgId: true, visibility: true, status: true, deletedAt: true, org: { select: { status: true, deletedAt: true } } },
  })
  if (!event || event.deletedAt || event.org.deletedAt || event.org.status !== 'ACTIVE') return false
  const publicEvent = event.visibility === 'PUBLIC' && ['PUBLISHED', 'LIVE', 'ENDED'].includes(event.status)
  if (publicEvent) return canJoinRoom(room, userId, { publicEvent: true })
  if (!userId) return false
  if (await acceptedOrgMember(userId, event.orgId)) return canJoinRoom(room, userId, { orgMember: true })
  if (!['PUBLISHED', 'LIVE', 'ENDED', 'POSTPONED', 'CANCELLED'].includes(event.status)) return false
  const approvedRsvp = await db.rsvp.findFirst({
    where: { eventId: room.id, userId, status: 'APPROVED' },
    select: { id: true },
  })
  if (approvedRsvp) return canJoinRoom(room, userId, { approvedRsvp: true })
  const ticket = await db.ticket.findFirst({
    where: { eventId: room.id, userId, status: { in: ['VALID', 'CHECKED_IN'] } },
    select: { id: true },
  })
  return canJoinRoom(room, userId, { validTicket: Boolean(ticket) })
}
