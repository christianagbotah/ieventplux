/**
 * iEventPlux LiveKit media admission reconciler.
 * Revokes active media for cancelled tickets, declined RSVPs, host bans,
 * revoked organizer roles, suspended events and ended meetings.
 *
 * It runs independently of browsers; a malicious client cannot opt out.
 * DB lookups are chunked (NOT participant limits). Media rooms are closed
 * only when the durable meeting/event is not currently active.
 */
import { RoomServiceClient } from 'livekit-server-sdk'
import { db } from '../../src/lib/db'
import { currentMeetingMediaEngine } from '../../src/server/meeting-sfu-policy'
import { configuredMeetingSfu } from '../../src/server/meeting-sfu-service'
import { meetingEventCallOpen, meetingEventUsable } from '../../src/server/meeting-policy'
import { batchSfuIdentities, findUnauthorizedSfuParticipants } from '../../src/server/meeting-sfu-guard-policy'

const config = configuredMeetingSfu()
if (currentMeetingMediaEngine() !== 'sfu' || !config) {
  throw new Error('SFU guard requires a configured media engine.')
}
const client = new RoomServiceClient(config.internalUrl, config.key, config.secret)
const dryRun = process.env.IEVENTPLUX_SFU_GUARD_DRY_RUN === 'true'
const intervalMs = 15_000
const roomPrefix = 'ieventplux-meeting-'
let inFlight = false
let terminated = false
let cycles = 0

async function reconcile() {
  if (inFlight || terminated) return
  inFlight = true
  const stats = { rooms: 0, participants: 0, evicted: 0, closed: 0, errors: 0 }
  try {
    for (const room of await client.listRooms()) {
      if (terminated) break
      if (!room.name.startsWith(roomPrefix)) continue
      const meetingId = room.name.slice(roomPrefix.length)
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(meetingId)) continue
      stats.rooms++
      try {
        const meeting = await db.eventMeeting.findUnique({
          where: { id: meetingId },
          select: {
            status: true, eventId: true,
            event: {
              select: {
                status: true, deletedAt: true, orgId: true,
                org: { select: { ownerId: true, status: true, deletedAt: true } },
              },
            },
          },
        })
        const open = Boolean(meeting && meetingEventUsable(meeting.event) &&
          meetingEventCallOpen(meeting.event) && meeting.status === 'LIVE')
        if (!open) {
          if (!dryRun) await client.deleteRoom(room.name)
          stats.closed++
          continue
        }
        if (!meeting) continue
        const people = await client.listParticipants(room.name)
        const identities = people.map((person) => person.identity)
        stats.participants += identities.length
        if (!identities.length) continue
        const paid = Boolean(await db.ticketType.findFirst({
          where: { eventId: meeting.eventId, priceMinor: { gt: 0 } }, select: { id: true },
        }))

        for (const slice of batchSfuIdentities(identities, 200)) {
          if (terminated) break
          const [hostMemberships, approvedRsvps, validTickets, bans] = await Promise.all([
            db.membership.findMany({
              where: { orgId: meeting.event.orgId, acceptedAt: { not: null }, userId: { in: slice } },
              select: { userId: true, role: true },
            }),
            db.rsvp.findMany({
              where: { eventId: meeting.eventId, status: 'APPROVED', userId: { in: slice } },
              select: { userId: true },
            }),
            db.ticket.findMany({
              where: { eventId: meeting.eventId, status: { in: ['VALID', 'CHECKED_IN'] }, userId: { in: slice } },
              select: { userId: true },
            }),
            db.meetingBan.findMany({
              where: { meetingId, userId: { in: slice } }, select: { userId: true },
            }),
          ])
          const unauthorized = findUnauthorizedSfuParticipants({
            roomStatus: meeting.status, eventOpen: true,
            orgOwnerId: meeting.event.org.ownerId,
            priced: paid, participants: slice,
            hostMemberships, approvedRsvps, validTickets, bans,
          })
          for (const userId of unauthorized) {
            if (dryRun) { stats.evicted++; continue }
            try {
              await client.removeParticipant(room.name, userId)
              stats.evicted++
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              if (!/not found|does not exist|participant not connected/i.test(message)) stats.errors++
            }
          }
        }
      } catch (error) {
        // Never kick legitimate participants if the DB or SFU is unavailable.
        // An error is retried on the next sweep rather than treated as denial.
        stats.errors++
        const message = error instanceof Error ? error.message : 'unknown'
        console.error('[sfu-guard] room check failed:', message.slice(0, 120))
      }
    }
    cycles++
    if (stats.rooms || stats.evicted || stats.closed || stats.errors || cycles % 20 === 0) {
      console.log('[sfu-guard] sweep', JSON.stringify({ ...stats, dryRun, cycles }))
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    console.error('[sfu-guard] media server check failed:', message.slice(0, 120))
  } finally {
    inFlight = false
  }
}

function shutdown() {
  terminated = true
  clearInterval(timer)
  void db.$disconnect().finally(() => process.exit(0))
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
const timer = setInterval(() => void reconcile(), intervalMs)
console.log('[sfu-guard] running: 15s, dryRun=' + dryRun)
void reconcile()
