import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, sanitizeText } from '@/server/api'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ code: string }> }

/** GET /api/v1/invitations/[code] — invitation details (no private guest data). */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    void req
    const { code } = await ctx.params
    const invitation = await db.invitation.findUnique({ where: { code: code.toUpperCase() }, include: { event: { select: { id: true, title: true, slug: true, startsAt: true, endsAt: true, city: true, coverImageUrl: true, org: { select: { name: true } } } } } })
    if (!invitation || invitation.status !== 'ACTIVE') throw errors.notFound('This invitation is no longer valid.')
    if (invitation.expiresAt && invitation.expiresAt < new Date()) throw errors.notFound('This invitation has expired.')
    const remaining = invitation.maxGuests - invitation.guestsUsed
    if (remaining <= 0) throw errors.conflict('This invitation is fully used.')
    return jsonOk({
      invitation: {
        code: invitation.code, displayName: invitation.displayName, maxGuests: invitation.maxGuests,
        guestsRemaining: remaining, requireApproval: invitation.requireApproval, event: invitation.event,
      },
    })
  })
}

/** POST /api/v1/invitations/[code] — RSVP to an invitation-only event. */
export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { code } = await ctx.params
    const user = await requireUser()
    const body = await readJson<{ guests?: number }>(req)
    const invitation = await db.invitation.findUnique({ where: { code: code.toUpperCase() }, include: { event: true } })
    if (!invitation || invitation.status !== 'ACTIVE') throw errors.notFound('This invitation is no longer valid.')
    if (invitation.expiresAt && invitation.expiresAt < new Date()) throw errors.notFound('This invitation has expired.')
    const guests = Math.max(1, Math.min(invitation.maxGuests - invitation.guestsUsed, Number(body.guests ?? 1)))

    const existing = await db.rsvp.findFirst({ where: { invitationId: invitation.id, userId: user.id } })
    if (existing) throw errors.conflict('You have already responded to this invitation.')

    const rsvp = await db.rsvp.create({
      data: {
        eventId: invitation.eventId,
        invitationId: invitation.id,
        userId: user.id,
        name: user.displayName,
        email: user.email,
        phone: user.phone,
        guests,
        status: invitation.requireApproval ? 'PENDING' : 'APPROVED',
      },
    })
    await db.invitation.update({ where: { id: invitation.id }, data: { guestsUsed: { increment: guests } } })
    const { notifyUser } = await import('@/server/services/notify')
    await notifyUser({
      userId: user.id,
      type: 'INVITATION',
      title: invitation.requireApproval ? 'RSVP received — awaiting approval' : 'RSVP confirmed',
      body: `${invitation.event.title}: ${invitation.requireApproval ? 'the organizer will approve your attendance shortly.' : 'your place is confirmed.'}`,
      link: `#/event/${invitation.event.slug}`,
    }).catch(() => {})
    void sanitizeText
    return jsonOk({ rsvp, approved: !invitation.requireApproval, nextStep: invitation.requireApproval ? 'await_approval' : 'tickets' })
  })
}
