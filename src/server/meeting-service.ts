import { createHmac } from 'node:crypto'
import { db } from '@/lib/db'
import { errors } from './api'
import { eventOrgAccess } from './permissions'
import { canJoinMeeting, meetingEventUsable, meetingEventCallOpen } from './meeting-policy'
import { configuredMeetingTurnUrls, meetingRuntimeEnabled, meetingTurnConfigured } from './meeting-turn-policy'

/**
 * Small-group meetings are disabled unless explicitly enabled in the runtime.
 * Never assume that a WebRTC SFU or TURN service is deployed merely because
 * the interface is compiled. All durable authorization happens server-side.
 */
export function meetingFeatureEnabled(): boolean {
  return meetingRuntimeEnabled(process.env)
}
export function requireMeetingFeature() {
  if (!meetingFeatureEnabled()) {
    throw errors.unavailable('MEETING_NOT_ENABLED', 'Interactive meetings are not enabled on this server yet.')
  }
}

export async function getMeetingAccess(meetingId: string, userId: string) {
  const meeting = await db.eventMeeting.findUnique({
    where: { id: meetingId },
    include: {
      event: {
        select: {
          id: true, orgId: true, title: true, slug: true, status: true, visibility: true, deletedAt: true,
          org: { select: { name: true, ownerId: true, status: true, deletedAt: true } },
        },
      },
    },
  })
  if (!meeting || !meetingEventUsable(meeting.event)) throw errors.notFound('Meeting unavailable.')
  const orgRights = await eventOrgAccess(userId, meeting.eventId, 'broadcast:manage')
  const organizer = orgRights.allowed || meeting.event.org.ownerId === userId
  const [rsvp, ticket] = organizer
    ? [null, null]
    : await Promise.all([
      db.rsvp.findFirst({ where: { eventId: meeting.eventId, userId, status: 'APPROVED' }, select: { id: true } }),
      db.ticket.findFirst({ where: { eventId: meeting.eventId, userId, status: { in: ['VALID', 'CHECKED_IN'] } }, select: { id: true } }),
    ])
  const attendee = Boolean(rsvp || ticket)
  if (!organizer) {
    const removed = await db.meetingBan.findUnique({
      where: { meetingId_userId: { meetingId, userId } }, select: { meetingId: true },
    })
    if (removed) throw errors.forbidden('The host has removed your access to this meeting.')
  }
  if (!organizer && !attendee) {
    throw errors.forbidden('An approved RSVP or a valid event ticket is required for this meeting.')
  }
  const canJoin = canJoinMeeting({
    roomStatus: meeting.status, validEvent: meetingEventCallOpen(meeting.event), signedIn: true,
    organizer, approvedRsvp: Boolean(rsvp), validTicket: Boolean(ticket),
  })
  return { meeting, organizer, attendee, canJoin }
}

/** Generate short-lived coturn REST credentials from a private shared secret.
 * TURN is required for reliable connections across restrictive networks.
 * The secret is NEVER sent to browsers; only expiring credentials are.
 */
export function meetingIceServers(userId: string) {
  const stun = process.env.MEETING_STUN_URL || 'stun:stun.l.google.com:19302'
  const servers: Array<{ urls: string | string[]; username?: string; credential?: string }> = []
  if (/^stuns?:[^\s]+$/.test(stun)) servers.push({ urls: stun })
  // Pick only the TURN configuration fields explicitly. Node's ProcessEnv
  // type is not assignable to a weak all-optional config interface on CI.
  const turnConfig = {
    MEETING_TURN_URLS: process.env.MEETING_TURN_URLS,
    MEETING_TURN_SHARED_SECRET: process.env.MEETING_TURN_SHARED_SECRET,
  }
  const turn = configuredMeetingTurnUrls(turnConfig)
  const secret = turnConfig.MEETING_TURN_SHARED_SECRET
  if (meetingTurnConfigured(turnConfig) && secret) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${userId}`
    const credential = createHmac('sha1', secret).update(username).digest('base64')
    servers.push({ urls: turn, username, credential })
  }
  return servers
}
