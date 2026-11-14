import { NextRequest, NextResponse } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, sanitizeText, jsonList, pagination, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'

type RouteContext = { params: Promise<{ id: string; action: string }> }

/**
 * Event sub-resources:
 *  GET/POST  transition, agenda, media, comments, updates, invitations, ticket-types, attendees, orders, roster
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, action } = await ctx.params
    const url = new URL(req.url)

    if (action === 'agenda') {
      const items = await db.agendaItem.findMany({ where: { eventId: id }, orderBy: [{ sortOrder: 'asc' }, { startsAt: 'asc' }] })
      return jsonOk({ items })
    }

    if (action === 'series') {
      const event = await db.event.findUnique({ where: { id } })
      if (!event || event.deletedAt || !event.seriesId) return jsonOk({ series: null, occurrences: [] })
      const series = await db.eventSeries.findUnique({ where: { id: event.seriesId } })
      const occurrences = await db.event.findMany({
        where: {
          seriesId: event.seriesId,
          deletedAt: null,
          id: { not: event.id },
          status: { in: ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'POSTPONED', 'LIVE'] },
          startsAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { startsAt: 'asc' },
        take: 12,
        select: { id: true, slug: true, title: true, startsAt: true, endsAt: true, status: true, visibility: true },
      })
      const visible = occurrences.filter((o) => o.visibility !== 'INVITE_ONLY')
      return jsonOk({
        series: series ? { id: series.id, title: series.title, recurrence: series.recurrence } : null,
        occurrences: visible.map((o) => ({ id: o.id, slug: o.slug, title: o.title, startsAt: o.startsAt.toISOString(), status: o.status })),
      })
    }

    if (action === 'waitlist') {
      const event = await db.event.findUnique({ where: { id } })
      if (!event || event.deletedAt) throw errors.notFound('Event not found.')
      const session = await (await import('@/server/auth')).getSession()
      const { waitlistStatus, waitlistOrganizerView } = await import('@/server/services/waitlist')
      const status = await waitlistStatus(id, session?.user.id ?? null)
      let entries: unknown = undefined
      if (session) {
        const access = await eventOrgAccess(session.user.id, id, 'attendees:view')
        if (access.allowed) entries = await waitlistOrganizerView(id)
      }
      return jsonOk({ ...status, entries })
    }

    // ── Round 15: "Remind me" opt-in state (signed-in fans without a ticket) ─
    if (action === 'reminder') {
      const event = await db.event.findUnique({ where: { id } })
      if (!event || event.deletedAt) throw errors.notFound('Event not found.')
      const session = await (await import('@/server/auth')).getSession()
      if (!session) return jsonOk({ active: false, holdingTicket: false, upcoming: event.startsAt > new Date() && !['CANCELLED', 'ENDED', 'POSTPONED'].includes(event.status) })
      const [row, ticket] = await Promise.all([
        db.eventReminder.findUnique({ where: { eventId_userId: { eventId: event.id, userId: session.user.id } } }),
        db.ticket.findFirst({ where: { userId: session.user.id, eventId: event.id, status: { in: ['VALID', 'CHECKED_IN'] } }, select: { id: true } }),
      ])
      return jsonOk({
        active: Boolean(row),
        holdingTicket: Boolean(ticket),
        upcoming: event.startsAt > new Date() && !['CANCELLED', 'ENDED', 'POSTPONED'].includes(event.status),
      })
    }

    if (action === 'ics') {
      const event = await db.event.findUnique({ where: { id }, include: { venue: true, org: { select: { name: true } } } })
      if (!event || event.deletedAt) throw errors.notFound('Event not found.')
      if (event.visibility !== 'PUBLIC') {
        const session = await (await import('@/server/auth')).getSession()
        if (!session) throw errors.unauthorized('This event\'s calendar file requires signing in.')
      }
      const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
      const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
      const loc = event.venue ? `${event.venue.name}${event.venue.address ? ', ' + event.venue.address : ''}${event.city ? ', ' + event.city : ''}` : event.mode === 'PHYSICAL' ? (event.city ?? '') : 'Online'
      const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//iEventPlux//Events//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${event.id}@ieventplux`,
        `DTSTAMP:${fmt(new Date())}`,
        `DTSTART:${fmt(event.startsAt)}`,
        `DTEND:${fmt(event.endsAt)}`,
        `SUMMARY:${esc(event.title)}`,
        `DESCRIPTION:${esc((event.summary ?? event.description).slice(0, 800))}`,
        `LOCATION:${esc(loc)}`,
        `ORGANIZER;CN=${esc(event.org.name)}:mailto:${esc(event.contactEmail ?? 'hello@ieventplux.app')}`,
        `URL:https://ieventplux.app/#/event/${event.slug}`,
        `STATUS:${event.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED'}`,
        'END:VEVENT',
        'END:VCALENDAR',
      ]
      return new NextResponse(lines.join('\r\n'), {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="${event.slug}.ics"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    if (action === 'media') {
      const items = await db.mediaAsset.findMany({ where: { eventId: id, OR: [{ linksToEventId: id }] }, orderBy: { createdAt: 'desc' } })
      return jsonOk({ items })
    }

    if (action === 'comments') {
      const { page, pageSize, offset } = pagination(req, 20, 50)
      const items = await db.comment.findMany({
        where: { eventId: id, status: 'VISIBLE', parentId: null },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          children: { where: { status: 'VISIBLE' }, include: { user: { select: { id: true, displayName: true, avatarUrl: true } } }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      })
      const total = await db.comment.count({ where: { eventId: id, status: 'VISIBLE', parentId: null } })
      return jsonList(items, total, page, pageSize)
    }

    if (action === 'updates') {
      const { listUpdates } = await import('@/server/services/updates')
      return jsonOk({ items: await listUpdates(id) })
    }

    if (action === 'attendees') {
      const user = await requireUser()
      const access = await eventOrgAccess(user.id, id, 'attendees:view')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Attendee lists are restricted to the event organization.')
      const { page, pageSize, offset } = pagination(req, 25, 100)
      const tickets = await db.ticket.findMany({
        where: { eventId: id },
        include: { ticketType: { select: { name: true } }, order: { select: { reference: true, status: true, buyerName: true } } },
        orderBy: { issuedAt: 'desc' },
        skip: offset,
        take: pageSize,
      })
      const total = await db.ticket.count({ where: { eventId: id } })
      return jsonList(
        tickets.map((t) => ({
          id: t.id, code: t.code, holderName: t.holderName, ticketType: t.ticketType.name, status: t.status,
          checkedInAt: t.checkedInAt, issuedAt: t.issuedAt, orderRef: t.order?.reference ?? null,
        })),
        total, page, pageSize
      )
    }

    if (action === 'orders') {
      const user = await requireUser()
      const access = await eventOrgAccess(user.id, id, 'orders:view')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Orders are restricted to the event organization.')
      const { page, pageSize, offset } = pagination(req, 25, 100)
      const orders = await db.order.findMany({
        where: { eventId: id },
        include: { items: { include: { ticketType: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      })
      const total = await db.order.count({ where: { eventId: id } })
      return jsonList(orders, total, page, pageSize)
    }

    if (action === 'invitations') {
      const user = await requireUser()
      const access = await eventOrgAccess(user.id, id, 'event:edit')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Invitations are managed by the event organization.')
      const items = await db.invitation.findMany({ where: { eventId: id }, orderBy: { createdAt: 'desc' } })
      return jsonOk({ items })
    }

    // R28 — guest management payload in ONE round trip: invitations (with
    // live RSVP counts) + the RSVP ledger (pending queue first, then decided).
    if (action === 'guests') {
      const user = await requireUser()
      const access = await eventOrgAccess(user.id, id, 'event:edit')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Guest lists are managed by the event organization.')
      const [invitations, rsvps] = await Promise.all([
        db.invitation.findMany({
          where: { eventId: id },
          orderBy: { createdAt: 'desc' },
          include: {
            _count: { select: { rsvps: true } },
            rsvps: { select: { status: true } },
          },
        }),
        db.rsvp.findMany({
          where: { eventId: id },
          include: { invitation: { select: { code: true, displayName: true } } },
          orderBy: [{ createdAt: 'desc' }],
          take: 200,
        }),
      ])
      const invitationItems = invitations.map((i) => ({
        id: i.id,
        code: i.code,
        displayName: i.displayName,
        contact: i.contact,
        maxGuests: i.maxGuests,
        guestsUsed: i.guestsUsed,
        guestsRemaining: Math.max(0, i.maxGuests - i.guestsUsed),
        requireApproval: i.requireApproval,
        expiresAt: i.expiresAt,
        status: i.status,
        createdAt: i.createdAt,
        rsvpCount: i._count.rsvps,
        approvedCount: i.rsvps.filter((r) => r.status === 'APPROVED').length,
        pendingCount: i.rsvps.filter((r) => r.status === 'PENDING').length,
      }))
      // Pending queue first (actionable), then approved, declined, newest first.
      const rank = (s: string) => (s === 'PENDING' ? 0 : s === 'APPROVED' ? 1 : 2)
      const rsvpItems = rsvps
        .map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          phone: r.phone,
          guests: r.guests,
          status: r.status,
          createdAt: r.createdAt,
          decidedAt: r.decidedAt,
          invitationCode: r.invitation ? r.invitation.code : null,
          invitationName: r.invitation ? r.invitation.displayName : null,
        }))
        .sort((a, b) => rank(a.status) - rank(b.status) || b.createdAt.getTime() - a.createdAt.getTime())
      return jsonOk({ invitations: invitationItems, rsvps: rsvpItems })
    }

    if (action === 'stats') {
      const user = await requireUser()
      const access = await eventOrgAccess(user.id, id, 'orders:view')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Event statistics are restricted to the event organization.')
      const [paidOrders, freeOrders, ticketsSold, checkedIn, revenue, byType] = await Promise.all([
        db.order.count({ where: { eventId: id, status: 'PAID', kind: 'PAID' } }),
        db.order.count({ where: { eventId: id, status: 'PAID', kind: 'FREE' } }),
        db.ticket.count({ where: { eventId: id, status: { in: ['VALID', 'CHECKED_IN', 'REFUNDED'] } } }),
        db.ticket.count({ where: { eventId: id, status: 'CHECKED_IN' } }),
        db.order.aggregate({ where: { eventId: id, status: 'PAID' }, _sum: { totalMinor: true, platformFeeMinor: true } }),
        db.ticketType.findMany({ where: { eventId: id }, select: { name: true, quota: true, soldCount: true, reservedCount: true, priceMinor: true } }),
      ])
      return jsonOk({
        paidOrders, freeOrders, ticketsSold, checkedIn,
        grossMinor: revenue._sum.totalMinor ?? 0,
        feesMinor: revenue._sum.platformFeeMinor ?? 0,
        netMinor: (revenue._sum.totalMinor ?? 0) - (revenue._sum.platformFeeMinor ?? 0),
        byType,
      })
    }

    if (action === 'discount-codes') {
      const user = await requireUser()
      const access = await eventOrgAccess(user.id, id, 'tickets:manage')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Ticket management is restricted to the event organization.')
      const items = await db.discountCode.findMany({ where: { eventId: id } })
      return jsonOk({ items })
    }

    // ── Round 15: attendee CSV export (org-only, audited PII egress) ────────
    if (action === 'export') {
      const user = await requireUser()
      const access = await eventOrgAccess(user.id, id, 'attendees:view')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Attendee exports are restricted to the event organization.')
      const eventRow = await db.event.findUnique({ where: { id }, select: { slug: true } })
      const tickets = await db.ticket.findMany({
        where: { eventId: id },
        include: {
          ticketType: { select: { name: true } },
          order: { select: { reference: true, status: true, buyerName: true, buyerEmail: true, buyerPhone: true, totalMinor: true, currency: true, createdAt: true } },
        },
        orderBy: { issuedAt: 'asc' },
        take: 5000,
      })
      const esc = (v: unknown) => {
        const s = v === null || v === undefined ? '' : String(v)
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const header = ['ticket_code', 'holder_name', 'ticket_type', 'ticket_status', 'checked_in_at', 'issued_at', 'order_reference', 'order_status', 'buyer_name', 'buyer_email', 'buyer_phone', 'order_total_minor', 'currency', 'order_placed_at']
      const lines = [header.join(',')]
      for (const t of tickets) {
        const o = t.order
        lines.push([
          t.code, t.holderName, t.ticketType.name, t.status, t.checkedInAt?.toISOString() ?? '', t.issuedAt.toISOString(),
          o?.reference ?? '', o?.status ?? '', o?.buyerName ?? '', o?.buyerEmail ?? '', o?.buyerPhone ?? '',
          o?.totalMinor ?? '', o?.currency ?? '', o?.createdAt.toISOString() ?? '',
        ].map(esc).join(','))
      }
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'event.export-attendees', entityType: 'Event', entityId: id, after: { rows: tickets.length } })
      return new NextResponse(lines.join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${eventRow?.slug ?? 'event'}-attendees.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // ── Round 15: AI review digest (public, DB-cached, honest fallback) ────
    if (action === 'review-digest') {
      const event = await db.event.findUnique({ where: { id }, select: { id: true, deletedAt: true } })
      if (!event || event.deletedAt) throw errors.notFound('Event not found.')
      const { reviewDigest } = await import('@/server/services/aiDigest')
      return jsonOk(await reviewDigest(id))
    }

    void url
    throw errors.notFound(`Unknown event sub-resource '${action}'.`)
  })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { id, action } = await ctx.params
    const body = await readJson<Record<string, unknown>>(req).catch(() => ({}) as Record<string, unknown>)

    // ── Waitlist (guest-friendly; joins are only valid while sold out) ────
    if (action === 'waitlist') {
      await rateLimit(req, 'waitlist-join', 5, 60_000)
      const session = await (await import('@/server/auth')).getSession()
      const { joinWaitlist } = await import('@/server/services/waitlist')
      const result = await joinWaitlist({
        eventId: id,
        ticketTypeId: body.ticketTypeId ? String(body.ticketTypeId) : null,
        userId: session?.user.id ?? null,
        name: sanitizeText(String(body.name ?? ''), 80),
        contact: String(body.contact ?? ''),
        partySize: Number(body.partySize ?? 1),
      })
      return jsonOk({ position: result.position, reactivated: result.reactivated, status: result.entry.status })
    }

    if (action === 'waitlist-leave') {
      const session = await (await import('@/server/auth')).getSession()
      const { leaveWaitlist } = await import('@/server/services/waitlist')
      await leaveWaitlist(id, { userId: session?.user.id ?? null, contact: body.contact ? String(body.contact) : undefined })
      return jsonOk({ left: true })
    }

    // ── Round 15: AI moderation triage (organizer decision support) ─────────
    if (action === 'moderation-triage') {
      await rateLimit(req, 'moderation-triage', 6, 60_000)
      const user = await requireUser()
      const access = await eventOrgAccess(user.id, id, 'event:edit')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Moderation tools are restricted to the event organization.')
      const { moderationTriage } = await import('@/server/services/aiTriage')
      return jsonOk(await moderationTriage(id))
    }

    // ── Round 15: "Remind me" set / cancel ─────────────────────────────────
    if (action === 'reminder') {
      await rateLimit(req, 'reminder-set', 20, 60_000)
      const user = await requireUser()
      const event = await db.event.findUnique({ where: { id } })
      if (!event || event.deletedAt) throw errors.notFound('Event not found.')
      if (['CANCELLED', 'ENDED', 'POSTPONED'].includes(event.status) || event.startsAt <= new Date()) {
        throw errors.conflict('Reminders are only available for upcoming events.')
      }
      await db.eventReminder.upsert({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
        update: {},
        create: { eventId: event.id, userId: user.id },
      })
      return jsonOk({ active: true })
    }

    if (action === 'reminder-cancel') {
      const user = await requireUser()
      await db.eventReminder.deleteMany({ where: { eventId: id, userId: user.id } })
      return jsonOk({ active: false })
    }

    const user = await requireUser()

    // ── Apply-to-series: bulk edit future occurrences of the same series ──
    if (action === 'apply-to-series') {
      const access = await eventOrgAccess(user.id, id, 'event:edit')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('You do not have permission to edit this event.')
      const source = await db.event.findUnique({ where: { id } })
      if (!source || source.deletedAt) throw errors.notFound('Event not found.')
      if (!source.seriesId) throw errors.badRequest('This event is not part of a series.')

      const fields = Array.isArray(body.fields) ? body.fields.map(String) : []
      const WHITELIST = ['title', 'summary', 'description', 'categorySlug', 'coverImageUrl', 'city', 'venueId', 'directionsUrl', 'contactEmail', 'contactPhone', 'accessibilityInfo', 'attendanceRules', 'ageGuidance', 'refundPolicy'] as const
      const picked = fields.filter((f) => (WHITELIST as readonly string[]).includes(f))
      const adoptTime = Boolean(body.adoptTime)
      if (picked.length === 0 && !adoptTime) throw errors.badRequest('Pick at least one field to apply (or time-of-day).')

      const now = new Date()
      const targets = await db.event.findMany({
        where: {
          seriesId: source.seriesId,
          id: { not: source.id },
          deletedAt: null,
          status: { in: ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'POSTPONED'] },
          startsAt: { gt: now },
        },
        orderBy: { startsAt: 'asc' },
      })

      // Wall-clock adoption: each occurrence keeps its local date but takes the
      // source's local time-of-day + duration, resolved in the event timezone.
      const zonedOffsetMs = (utc: Date, tz: string) => {
        try {
          const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
          const parts = dtf.formatToParts(utc)
          const get = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? '0')
          const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
          return asUTC - utc.getTime()
        } catch {
          return 0
        }
      }

      let updated = 0
      for (const target of targets) {
        const data: Record<string, unknown> = {}
        for (const f of picked) data[f] = (source as unknown as Record<string, unknown>)[f] ?? null
        if (adoptTime) {
          const tz = source.timezone || 'Africa/Accra'
          const srcStartLocal = new Date(source.startsAt.getTime() + zonedOffsetMs(source.startsAt, tz))
          const srcEndLocal = new Date(source.endsAt.getTime() + zonedOffsetMs(source.endsAt, tz))
          const durationMs = srcEndLocal.getTime() - srcStartLocal.getTime()
          const tgtLocal = new Date(target.startsAt.getTime() + zonedOffsetMs(target.startsAt, tz))
          tgtLocal.setUTCHours(srcStartLocal.getUTCHours(), srcStartLocal.getUTCMinutes(), 0, 0)
          const newStart = new Date(tgtLocal.getTime() - zonedOffsetMs(tgtLocal, tz))
          data.startsAt = newStart
          data.endsAt = new Date(newStart.getTime() + durationMs)
        }
        if (Object.keys(data).length > 0) {
          await db.event.update({ where: { id: target.id }, data })
          updated += 1
        }
      }

      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'event.apply-to-series', entityType: 'EventSeries', entityId: String(source.seriesId), after: { fields: picked, adoptTime, updated } })
      return jsonOk({ updated, fields: picked, adoptTime })
    }

    // ── Lifecycle transitions (publish/cancel/postpone/schedule) ──────────
    if (action === 'transition') {
      const access = await eventOrgAccess(user.id, id, 'event:publish')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('You do not have permission to change this event\'s status.')
      const to = String(body.to ?? '')
      if (!['DRAFT', 'SCHEDULED', 'PUBLISHED', 'POSTPONED', 'CANCELLED', 'LIVE', 'ENDED'].includes(to)) throw errors.badRequest('Invalid target status.')
      if (to === 'CANCELLED' || to === 'POSTPONED') {
        const cancelAccess = await eventOrgAccess(user.id, id, 'event:cancel')
        if (!cancelAccess.allowed) throw errors.forbidden('Cancelling or postponing requires an owner or admin role.')
      }
      const { transitionEvent } = await import('@/server/services/events')
      if (to === 'PUBLISHED') {
        // Paid selling requires a verified organization (settlement model rule).
        const org = await db.organization.findUnique({ where: { id: access.event.orgId } })
        const hasPaidTickets = await db.ticketType.count({ where: { eventId: id, priceMinor: { gt: 0 } } })
        if (org && org.status !== 'ACTIVE' && hasPaidTickets > 0) {
          throw errors.forbidden('Paid ticket sales require organizer verification before publishing. Submit verification documents or set tickets to free RSVP.')
        }
        const { assertCanPublishNewEvent } = await import('@/server/services/subscriptions')
        await assertCanPublishNewEvent(access.event.orgId)
      }
      const updated = await transitionEvent({ eventId: id, to, actorId: user.id, reason: body.reason ? String(body.reason) : undefined, publishAt: body.publishAt ? new Date(String(body.publishAt)) : null })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: `event.${to.toLowerCase()}`, entityType: 'Event', entityId: id, after: { status: to } })
      return jsonOk({ event: updated })
    }

    // ── Agenda items ──────────────────────────────────────────────────────
    if (action === 'agenda') {
      const access = await eventOrgAccess(user.id, id, 'event:edit')
      if (!access.allowed) throw errors.forbidden('You do not have permission to edit this event.')
      const title = sanitizeText(body.title, 160)
      if (!title) throw errors.badRequest('Agenda item title is required.')
      const item = await db.agendaItem.create({
        data: {
          eventId: id,
          title,
          startsAt: new Date(String(body.startsAt ?? new Date().toISOString())),
          endsAt: body.endsAt ? new Date(String(body.endsAt)) : null,
          speaker: sanitizeText(body.speaker, 120) || null,
          description: sanitizeText(body.description, 500) || null,
          sortOrder: Number(body.sortOrder ?? 0),
        },
      })
      return jsonOk({ item })
    }

    // ── Organizer updates (posts) ─────────────────────────────────────────
    if (action === 'updates') {
      const { postUpdate } = await import('@/server/services/updates')
      const result = await postUpdate({
        eventId: id,
        userId: user.id,
        actorLabel: user.email,
        title: String(body.title ?? ''),
        body: String(body.body ?? ''),
        important: Boolean(body.important),
      })
      return jsonOk(result)
    }

    // ── Comments (discussion/Q&A) ─────────────────────────────────────────
    if (action === 'comments') {
      await rateLimit(req, 'comment', 10, 60_000)
      const event = await db.event.findUnique({ where: { id } })
      if (!event) throw errors.notFound('Event not found.')
      const text = sanitizeText(body.body, 1000)
      if (text.length < 2) throw errors.badRequest('Comment is empty.')
      const comment = await db.comment.create({
        data: { eventId: id, userId: user.id, parentId: body.parentId ? String(body.parentId) : null, body: text },
      })
      return jsonOk({ comment })
    }

    // ── Invitations ───────────────────────────────────────────────────────
    if (action === 'invitations') {
      const access = await eventOrgAccess(user.id, id, 'event:edit')
      if (!access.allowed) throw errors.forbidden('You do not have permission to manage invitations.')
      const { invitationCode } = await import('@/server/ids')
      const invitation = await db.invitation.create({
        data: {
          eventId: id,
          code: String(body.code ?? invitationCode()).toUpperCase().slice(0, 24),
          displayName: sanitizeText(body.displayName, 120) || null,
          contact: sanitizeText(body.contact, 160) || null,
          maxGuests: Math.max(1, Math.min(10, Number(body.maxGuests ?? 2))),
          requireApproval: Boolean(body.requireApproval),
          expiresAt: body.expiresAt ? new Date(String(body.expiresAt)) : null,
          createdBy: user.id,
        },
      })
      return jsonOk({ invitation })
    }

    // ── R28: RSVP decision queue write path (approve / decline) ────────────
    // Rsvp.decidedAt/decidedBy and DECLINED were modeled but had NO writer —
    // guests with requireApproval invitations were stuck "awaiting approval" forever.
    if (action === 'rsvp-decision') {
      const access = await eventOrgAccess(user.id, id, 'event:edit')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('You do not have permission to decide invitations.')
      await rateLimit(req, 'rsvp-decision', 60, 60_000)
      const rsvpId = String(body.rsvpId ?? '')
      const decision = String(body.decision ?? '')
      if (!rsvpId) throw errors.badRequest('rsvpId is required.')
      if (!['approve', 'decline'].includes(decision)) throw errors.badRequest('decision must be approve or decline.')
      const rsvp = await db.rsvp.findUnique({ where: { id: rsvpId }, include: { invitation: true } })
      if (!rsvp || rsvp.eventId !== access.event.id) throw errors.notFound('RSVP not found for this event.')
      if (rsvp.status !== 'PENDING') throw errors.conflict(`This RSVP was already decided (${rsvp.status.toLowerCase()}).`)

      const approved = decision === 'approve'
      const updated = await db.rsvp.update({
        where: { id: rsvp.id },
        data: { status: approved ? 'APPROVED' : 'DECLINED', decidedAt: new Date(), decidedBy: user.id },
      })
      // Declines release the guest seats the pending RSVP had claimed, so a
      // shared invitation stays usable by the next guest (floor at zero). A
      // code that had flipped EXHAUSTED returns to ACTIVE when seats free up.
      if (!approved && rsvp.invitation) {
        const inv = await db.invitation.findUnique({ where: { id: rsvp.invitation.id } })
        if (inv) {
          const used = Math.max(0, inv.guestsUsed - rsvp.guests)
          await db.invitation
            .update({
              where: { id: inv.id },
              data: { guestsUsed: used, status: inv.status === 'EXHAUSTED' && used < inv.maxGuests ? 'ACTIVE' : inv.status },
            })
            .catch(() => {})
        }
      }
      const { notifyUser } = await import('@/server/services/notify')
      const event = access.event
      if (rsvp.userId) {
        await notifyUser({
          userId: rsvp.userId,
          type: 'INVITATION',
          title: approved ? 'Your invitation is approved' : 'Your RSVP was declined',
          body: approved
            ? `${event.title}: your place is confirmed — the private address is now visible and tickets are unlocked.`
            : `${event.title}: the organizer is unable to accommodate this RSVP.`,
          link: approved ? `#/event/${event.slug}` : rsvp.invitation ? `#/invite/${rsvp.invitation.code}` : `#/event/${event.slug}`,
        }).catch(() => {})
      }
      const { audit } = await import('@/server/audit')
      await audit({
        actorUserId: user.id,
        actorLabel: user.email,
        action: approved ? 'rsvp.approve' : 'rsvp.decline',
        entityType: 'Rsvp',
        entityId: rsvp.id,
        before: { status: 'PENDING', guests: rsvp.guests },
        after: { status: updated.status, decidedBy: user.email },
      })
      return jsonOk({ rsvp: updated })
    }

    // ── R28: invitation revoke (REVOKED previously had no writer) ───────────
    if (action === 'invitation-revoke') {
      const access = await eventOrgAccess(user.id, id, 'event:edit')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('You do not have permission to manage invitations.')
      await rateLimit(req, 'invitation-revoke', 30, 60_000)
      const invitationId = String(body.invitationId ?? '')
      if (!invitationId) throw errors.badRequest('invitationId is required.')
      const invitation = await db.invitation.findUnique({ where: { id: invitationId } })
      if (!invitation || invitation.eventId !== access.event.id) throw errors.notFound('Invitation not found for this event.')
      if (invitation.status !== 'ACTIVE') throw errors.conflict('This invitation is already closed.')
      const revoked = await db.invitation.update({ where: { id: invitation.id }, data: { status: 'REVOKED' } })
      const { audit } = await import('@/server/audit')
      await audit({
        actorUserId: user.id,
        actorLabel: user.email,
        action: 'invitation.revoke',
        entityType: 'Invitation',
        entityId: invitation.id,
        before: { code: invitation.code, status: invitation.status, guestsUsed: invitation.guestsUsed },
        after: { status: 'REVOKED' },
      })
      return jsonOk({ invitation: revoked })
    }

    // ── Discount codes ────────────────────────────────────────────────────
    if (action === 'discount-codes') {
      const access = await eventOrgAccess(user.id, id, 'tickets:manage')
      if (!access.allowed) throw errors.forbidden('You do not have permission to manage discounts.')
      const code = sanitizeText(body.code, 24).toUpperCase()
      if (code.length < 3) throw errors.badRequest('Code must be at least 3 characters.')
      const dc = await db.discountCode.create({
        data: {
          eventId: id,
          code,
          pctOff: body.pctOff ? Math.min(90, Math.max(1, Number(body.pctOff))) : null,
          amountOffMinor: body.amountOffMinor ? Math.max(1, Number(body.amountOffMinor)) : null,
          maxUses: Math.max(1, Number(body.maxUses ?? 100)),
          expiresAt: body.expiresAt ? new Date(String(body.expiresAt)) : null,
        },
      })
      return jsonOk({ discountCode: dc })
    }

    // ── Ticket types ──────────────────────────────────────────────────────
    if (action === 'ticket-types') {
      const access = await eventOrgAccess(user.id, id, 'tickets:manage')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('You do not have permission to manage tickets.')
      const name = sanitizeText(body.name, 80)
      if (!name) throw errors.badRequest('Ticket type name is required.')
      const priceMinor = Math.max(0, Math.round(Number(body.priceMinor ?? 0)))
      const quota = Math.max(0, Math.round(Number(body.quota ?? 0)))
      const event = await db.event.findUnique({ where: { id } })
      if (priceMinor > 0 && event) {
        const org = await db.organization.findUnique({ where: { id: event.orgId } })
        if (org && org.status !== 'ACTIVE') throw errors.forbidden('Paid ticket types require organizer verification.')
      }
      const tt = await db.ticketType.create({
        data: {
          eventId: id,
          orgId: access.event.orgId,
          name,
          description: sanitizeText(body.description, 300) || null,
          kind: ['PHYSICAL', 'VIRTUAL', 'HYBRID'].includes(String(body.kind)) ? String(body.kind) : 'PHYSICAL',
          priceMinor,
          currency: 'GHS',
          quota,
          perBuyerLimit: Math.max(1, Math.min(20, Number(body.perBuyerLimit ?? 4))),
          saleStartsAt: body.saleStartsAt ? new Date(String(body.saleStartsAt)) : null,
          saleEndsAt: body.saleEndsAt ? new Date(String(body.saleEndsAt)) : null,
          includesVirtualAccess: Boolean(body.includesVirtualAccess),
          groupMinQty: body.groupMinQty ? Number(body.groupMinQty) : null,
          groupPctOff: body.groupPctOff ? Number(body.groupPctOff) : null,
          sortOrder: Number(body.sortOrder ?? 0),
        },
      })
      return jsonOk({ ticketType: tt })
    }

    throw errors.notFound(`Unknown event action '${action}'.`)
  })
}
