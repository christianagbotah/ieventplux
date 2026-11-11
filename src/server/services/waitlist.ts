import { db } from '../../lib/db'
import { errors } from '../api'
import { enqueue } from '../outbox'
import { notifyUser, queueMessage } from './notify'

/**
 * Waitlist for sold-out inventory (real demand capture, honest fulfilment).
 *
 * Invariants:
 *  - One entry per (event, contact). Re-joining after LEFT/NOTIFIED re-activates at the tail.
 *  - Queue order is FIFO by createdAt among WAITING entries — positions are computed, never stored,
 *    so no bookkeeping drift when people leave.
 *  - Promotion NEVER holds or reserves inventory. Notified fans get a first-come-first-served window;
 *    the copy says so explicitly. No fake scarcity, no fake reservations.
 */

export interface WaitlistJoinInput {
  eventId: string
  ticketTypeId?: string | null
  userId?: string | null
  name: string
  contact: string
  partySize: number
}

function normalizeContact(raw: string): string {
  const value = raw.trim()
  if (/@/.test(value)) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) throw errors.badRequest('Enter a valid email address or phone number.')
    return value.toLowerCase()
  }
  const digits = value.replace(/[^\d+]/g, '')
  if (digits.replace(/\D/g, '').length < 9) throw errors.badRequest('Enter a valid email address or phone number.')
  return digits
}

/** Remaining purchasable units for a ticket type right now (0 quota = unbounded). */
export function remainingFor(tt: { quota: number; soldCount: number; reservedCount: number }): number {
  if (tt.quota <= 0) return Number.POSITIVE_INFINITY
  return Math.max(0, tt.quota - tt.soldCount - tt.reservedCount)
}

export async function joinWaitlist(input: WaitlistJoinInput) {
  const event = await db.event.findUnique({ where: { id: input.eventId }, include: { ticketTypes: true } })
  if (!event || event.deletedAt) throw errors.notFound('Event not found.')
  if (['CANCELLED', 'ENDED', 'POSTPONED'].includes(event.status)) throw errors.conflict('This event is not open for the waitlist.')
  if (event.startsAt.getTime() < Date.now()) throw errors.conflict('This event has already started.')

  const activeTypes = event.ticketTypes.filter((tt) => tt.active)
  const soldOut = activeTypes.length > 0 && activeTypes.every((tt) => remainingFor(tt) === 0)
  if (!soldOut) {
    throw errors.conflict('Tickets are currently available — go grab one instead of the waitlist.')
  }

  let ticketTypeId: string | null = null
  if (input.ticketTypeId) {
    const tt = event.ticketTypes.find((t) => t.id === input.ticketTypeId)
    if (!tt) throw errors.badRequest('Unknown ticket type.')
    ticketTypeId = tt.id
  }

  const contact = normalizeContact(input.contact)
  const name = input.name.trim().slice(0, 80)
  if (name.length < 2) throw errors.badRequest('Tell us your name (at least 2 characters).')
  const partySize = Math.max(1, Math.min(10, Math.round(Number(input.partySize) || 1)))

  const existing = await db.waitlistEntry.findUnique({ where: { eventId_contact: { eventId: event.id, contact } } })
  if (existing && existing.status === 'WAITING') {
    const position = await positionOf(event.id, existing.createdAt)
    return { entry: existing, position, reactivated: false }
  }

  const entry = existing
    ? await db.waitlistEntry.update({ where: { id: existing.id }, data: { status: 'WAITING', name, partySize, ticketTypeId, userId: input.userId ?? existing.userId, notifiedAt: null } })
    : await db.waitlistEntry.create({
        data: {
          eventId: event.id,
          ticketTypeId,
          userId: input.userId ?? null,
          name,
          contact,
          partySize,
          status: 'WAITING',
        },
      })
  const position = await positionOf(event.id, entry.createdAt)
  return { entry, position, reactivated: Boolean(existing) }
}

async function positionOf(eventId: string, createdAt: Date): Promise<number> {
  const ahead = await db.waitlistEntry.count({ where: { eventId, status: 'WAITING', createdAt: { lt: createdAt } } })
  return ahead + 1
}

export async function leaveWaitlist(eventId: string, opts: { userId?: string | null; contact?: string }) {
  const entry = await db.waitlistEntry.findFirst({
    where: { eventId, ...(opts.userId ? { userId: opts.userId } : { contact: normalizeContact(opts.contact ?? '') }) },
    orderBy: { createdAt: 'desc' },
  })
  if (!entry) throw errors.notFound('No waitlist entry found for this contact on this event.')
  if (entry.status === 'LEFT') return entry
  return db.waitlistEntry.update({ where: { id: entry.id }, data: { status: 'LEFT' } })
}

/** Public surface: queue length + the signed-in user's own position. */
export async function waitlistStatus(eventId: string, userId?: string | null) {
  const count = await db.waitlistEntry.count({ where: { eventId, status: 'WAITING' } })
  let mine: { position: number; status: string; partySize: number; notifiedAt: string | null } | null = null
  if (userId) {
    const entry = await db.waitlistEntry.findFirst({ where: { eventId, userId }, orderBy: { createdAt: 'desc' } })
    if (entry) {
      const position = entry.status === 'WAITING' ? await positionOf(eventId, entry.createdAt) : null
      mine = { position: position ?? 0, status: entry.status, partySize: entry.partySize, notifiedAt: entry.notifiedAt?.toISOString() ?? null }
    }
  }
  return { count, mine }
}

/** Organizer surface: full queue (their own event's demand data). */
export async function waitlistOrganizerView(eventId: string) {
  const entries = await db.waitlistEntry.findMany({
    where: { eventId },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    include: { ticketType: { select: { name: true } } },
  })
  return entries.map((e) => ({
    id: e.id,
    name: e.name,
    contact: e.contact,
    partySize: e.partySize,
    status: e.status,
    ticketType: e.ticketType?.name ?? null,
    joinedAt: e.createdAt.toISOString(),
    notifiedAt: e.notifiedAt?.toISOString() ?? null,
  }))
}

/**
 * Promote waiting fans when inventory frees up for an event.
 * Notifies up to `maxNotify` FIFO WAITING entries while there is real capacity.
 * Capacity-aware: an entry with partySize 4 is skipped while only 2 seats exist.
 */
export async function promoteWaitlist(eventId: string, opts: { maxNotify?: number } = {}) {
  const maxNotify = Math.max(1, Math.min(20, opts.maxNotify ?? 10))
  const event = await db.event.findUnique({ where: { id: eventId }, include: { ticketTypes: true } })
  if (!event || ['CANCELLED', 'ENDED'].includes(event.status)) return { notified: 0, capacity: 0 }

  const availableTypes = event.ticketTypes.filter((tt) => tt.active && remainingFor(tt) > 0)
  const capacity = availableTypes.reduce((sum, tt) => sum + (Number.isFinite(remainingFor(tt)) ? remainingFor(tt) : 99), 0)
  if (capacity <= 0) return { notified: 0, capacity: 0 }

  const waiting = await db.waitlistEntry.findMany({
    where: { eventId, status: 'WAITING', OR: [{ ticketTypeId: null }, { ticketTypeId: { in: availableTypes.map((t) => t.id) } }] },
    orderBy: { createdAt: 'asc' },
    take: maxNotify * 2,
  })

  let notified = 0
  const when = event.startsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: event.timezone || 'Africa/Accra' })
  for (const entry of waiting) {
    if (notified >= maxNotify || notified >= capacity) break
    const link = `#/event/${event.slug}`
    const title = 'Tickets just opened up'
    const body = `${event.title} (${when}) has tickets available again. First come, first served — nothing is held for you, so book soon.`
    if (entry.userId) {
      await notifyUser({ userId: entry.userId, type: 'WAITLIST_PROMOTED', title, body, link }).catch(() => {})
    }
    await queueMessage({
      channel: 'SMS',
      target: entry.contact,
      userId: entry.userId ?? null,
      orgId: event.orgId,
      template: 'waitlist_promoted',
      body: `iEventPlux: ${body} Book: ${link}`,
      purpose: 'TRANSACTIONAL',
      dedupKey: `wl-promote:${entry.id}:${entry.notifiedAt?.getTime() ?? 0}`,
      eventId: event.id,
    }).catch(() => null)
    await db.waitlistEntry.update({ where: { id: entry.id }, data: { status: 'NOTIFIED', notifiedAt: new Date() } })
    notified += 1
  }
  return { notified, capacity }
}

/**
 * Periodic self-healing sweep: any upcoming event that both (a) has freed inventory and
 * (b) has WAITING entries gets a promotion pass. Idempotent — entries flip to NOTIFIED.
 */
export async function sweepWaitlistPromotions(): Promise<{ events: number; notified: number }> {
  const now = new Date()
  const withWaiting = await db.waitlistEntry.groupBy({ by: ['eventId'], where: { status: 'WAITING' } })
  if (withWaiting.length === 0) return { events: 0, notified: 0 }
  let events = 0
  let notified = 0
  for (const { eventId } of withWaiting) {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { status: true, startsAt: true } })
    if (!event || ['CANCELLED', 'ENDED', 'DRAFT'].includes(event.status) || event.startsAt < now) continue
    const result = await promoteWaitlist(eventId)
    if (result.notified > 0) {
      events += 1
      notified += result.notified
    }
  }
  return { events, notified }
}

/** Called by the worker; supports both targeted and sweep invocations. */
export async function runWaitlistJob(payload: { eventId?: string }) {
  if (payload.eventId) {
    const result = await promoteWaitlist(payload.eventId)
    return { detail: `promoted=${result.notified} capacity=${result.capacity}` }
  }
  const result = await sweepWaitlistPromotions()
  return { detail: `events=${result.events} promoted=${result.notified}` }
}

/** Fire-and-forget trigger used by refund + quota-change paths. */
export function enqueueWaitlistPromote(eventId: string) {
  void enqueue('WAITLIST_PROMOTE', { eventId }, { runAt: new Date(Date.now() + 2000) }).catch(() => {})
}
