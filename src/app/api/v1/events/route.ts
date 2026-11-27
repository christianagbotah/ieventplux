import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import {eventInstant,eventTimezone,parseRepeatWeeks,weeklyEventOccurrences} from '@/server/event-series-timing'
import { handle, jsonOk, jsonList, pagination, requireUser, readJson, errors, sanitizeText, parseTags } from '@/server/api'
import { db } from '@/lib/db'
import { buildDiscoveryWhere } from '@/server/services/events'
import { orgCan } from '@/server/permissions'
import { assertCanPublishNewEvent } from '@/server/services/subscriptions'
import { organizerEventCatalogFilters } from '@/server/organizer-meeting-catalog'
import { parseDiscoverySort,validDiscoveryDate,orderByIds } from '@/server/discovery-sort'

/**
 * Events API:
 *  GET  /api/v1/events            → public discovery list (filters + pagination)
 *  POST /api/v1/events            → organizer event creation (org-scoped)
 */

const eventCardSelect = {
  id: true, slug: true, title: true, summary: true, categorySlug: true, coverImageUrl: true,
  mode: true, status: true, startsAt: true, endsAt: true, city: true, country: true, timezone: true,
  isFeatured: true, boostedUntil: true, venueId: true,
  org: { select: { id: true, name: true, slug: true, verifiedAt: true } },
  ticketTypes: { select: { priceMinor: true, currency: true, quota: true, soldCount: true, active: true }, where: { active: true } },
} as const

export async function GET(req: NextRequest) {
  return handle(async () => {
    const url = new URL(req.url)
    const mine = url.searchParams.get('mine') === '1'
    const { page, pageSize, offset } = pagination(req, 12, mine ? 50 : 36)

    if (mine) {
      const user = await requireUser()
      const requestedOrgId = url.searchParams.get('orgId')
      const requestedEventId = url.searchParams.get('eventId')
      // Targeted lookups for organizer attendee deep links remain behind the
      // accepted-membership org guard; never expose unlisted events publicly.
      if (requestedEventId && (requestedEventId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(requestedEventId))) {
        throw errors.badRequest('Invalid organizer event identifier.')
      }
      // Critical tenant boundary: the caller controls orgId and "mine" is not
      // inherently safe. Filter through ACCEPTED session-user memberships
      // before reading any draft, unlisted or invite-only event.
      const memberships = await db.membership.findMany({
        where: { userId: user.id, acceptedAt: { not: null }, org: { deletedAt: null } },
        select: { orgId: true },
      })
      const authorizedIds = memberships.map((membership) => membership.orgId)
      if (requestedOrgId && !authorizedIds.includes(requestedOrgId)) {
        throw errors.forbidden('You cannot view events in this organization.')
      }

      const where = {
        orgId: requestedOrgId ?? { in: authorizedIds },
        deletedAt: null,
        ...(requestedEventId ? { id: requestedEventId } : {}),
        ...organizerEventCatalogFilters({
          meetingEligible: url.searchParams.get('meetingEligible') === '1',
          status: url.searchParams.get('status'),
          q: url.searchParams.get('q'),
        }),
      }
      const items = await db.event.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
        select: { ...eventCardSelect, visibility: true, publishAt: true, seriesId: true },
      })
      const total = await db.event.count({ where })
      return jsonList(items, total, page, pageSize)
    }

    const sort=parseDiscoverySort(url.searchParams.get('sort'),url.searchParams.get('currency'))
    if(!sort)throw errors.badRequest('Choose a valid event sort and a single currency for price sorting.')
    const from=url.searchParams.get('from'),to=url.searchParams.get('to')
    if(!validDiscoveryDate(from)||!validDiscoveryDate(to)||(from&&to&&Date.parse(from)>Date.parse(to)))throw errors.badRequest('Invalid event date range.')
    const where = buildDiscoveryWhere({
      q: url.searchParams.get('q') ?? undefined,
      country: url.searchParams.get('country')?.toUpperCase() || undefined,
      timezone: url.searchParams.get('timezone') ?? undefined,
      onlineOnly: url.searchParams.get('access') === 'ONLINE',
      city: url.searchParams.get('city') ?? undefined,
      category: url.searchParams.get('category') ?? undefined,
      mode: (url.searchParams.get('mode') as 'PHYSICAL' | 'VIRTUAL' | 'HYBRID' | null) ?? undefined,
      price: (url.searchParams.get('price') as 'FREE' | 'PAID' | null) ?? undefined,
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      when: (url.searchParams.get('when') as 'TODAY' | 'THIS_WEEK' | 'THIS_WEEKEND' | 'LIVE_NOW' | null) ?? undefined,
    })
    if (url.searchParams.get('when') === 'LIVE_NOW') {
      where.status = 'LIVE'
    }
    if(sort.kind==='price'){
      const price=url.searchParams.get('price')
      const tickets={active:true,currency:sort.currency,...(price==='FREE'?{priceMinor:0}:price==='PAID'?{priceMinor:{gt:0}}:{})}
      // Rank the full matching catalogue, not just the current page, using
      // actual minimum active ticket price in one currency. Same predicate
      // for count, rank and fetched cards; no cross-currency comparison.
      const result=await db.$transaction(async tx=>{
        const eligible={...where,ticketTypes:{some:tickets}}
        const total=await tx.event.count({where:eligible})
        const ranked=await tx.ticketType.groupBy({by:['eventId'],where:{...tickets,event:eligible},_min:{priceMinor:true},orderBy:[{_min:{priceMinor:'asc'}},{eventId:'asc'}],skip:offset,take:pageSize})
        const ids=ranked.map(row=>row.eventId)
        const rows=ids.length?await tx.event.findMany({where:{...eligible,id:{in:ids}},select:eventCardSelect}):[]
        return {items:orderByIds(rows,ids),total}
      },{isolationLevel:'RepeatableRead'})
      return jsonList(result.items,result.total,page,pageSize)
    }
    const items = await db.event.findMany({
      where,
      orderBy: sort.kind==='newest'?[{createdAt:'desc'},{id:'asc'}]:[{startsAt:'asc'},{id:'asc'}],
      skip: offset,
      take: pageSize,
      select: eventCardSelect,
    })
    const total = await db.event.count({ where })
    return jsonList(items, total, page, pageSize)
  })
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    const body = await readJson<Record<string, unknown>>(req)
    const orgId = String(body.orgId ?? '')
    const { membershipFor } = await import('@/server/permissions')
    const membership = await membershipFor(user.id, orgId)
    if (!membership || !orgCan(membership.role, 'event:create')) throw errors.forbidden('Event creation requires an organizer role in this organization.')
    await assertCanPublishNewEvent(orgId) // plan limits enforced on the backend

    const title = sanitizeText(body.title, 140)
    if (title.length < 3) throw errors.badRequest('Event title is required.')
    const startsAt=eventInstant(body.startsAt),endsAt=eventInstant(body.endsAt)
    if(!startsAt||!endsAt||endsAt<=startsAt)throw errors.badRequest('Use valid event dates with an explicit timezone offset. End must be after start.')
    const timezone=eventTimezone(body.timezone??'Africa/Accra')
    if(!timezone)throw errors.badRequest('Choose a valid event timezone.')
    const repeatWeeks=parseRepeatWeeks(body.repeatWeeks)
    if(repeatWeeks===null)throw errors.badRequest('Choose between 0 and 26 extra weekly occurrences.')
    const occurrences=weeklyEventOccurrences(startsAt,endsAt,timezone,repeatWeeks)
    if(!occurrences)throw errors.badRequest('A recurring date has an ambiguous or nonexistent local time. Choose another event time.')
    const venueId=typeof body.venueId==='string'&&body.venueId?body.venueId:null
    const mode = ['PHYSICAL', 'VIRTUAL', 'HYBRID'].includes(String(body.mode)) ? String(body.mode) : 'PHYSICAL'
    if(body.visibility!==undefined&&!['PUBLIC','UNLISTED','INVITE_ONLY'].includes(String(body.visibility)))throw errors.badRequest('Choose a valid visibility setting.')
    const visibility=String(body.visibility??'PUBLIC')
    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)}-${randomUUID().slice(0,12)}`

    const common = {
        orgId,
        title,
        slug,
        summary: sanitizeText(body.summary, 200) || null,
        description: sanitizeText(body.description, 8000) || '',
        categorySlug: sanitizeText(body.categorySlug, 40) || 'community',
        tags: JSON.stringify(parseTags(body.tags)),
        coverImageUrl: typeof body.coverImageUrl === 'string' && body.coverImageUrl.startsWith('/') ? body.coverImageUrl : null,
        mode,
        visibility,
        status: 'DRAFT',
        venueId,
        country: sanitizeText(body.country, 2).toUpperCase() || 'GH',
        city: sanitizeText(body.city, 60) || null,
        timezone,
        startsAt,
        endsAt,
        contactEmail: sanitizeText(body.contactEmail, 160) || null,
        contactPhone: sanitizeText(body.contactPhone, 24) || null,
        accessibilityInfo: sanitizeText(body.accessibilityInfo, 500) || null,
        attendanceRules: sanitizeText(body.attendanceRules, 500) || null,
        ageGuidance: sanitizeText(body.ageGuidance, 60) || null,
        refundPolicy: sanitizeText(body.refundPolicy, 500) || null,
        createdBy: user.id,
      }
    return db.$transaction(async tx=>{
      const member=await tx.membership.findFirst({where:{orgId,userId:user.id,acceptedAt:{not:null},org:{deletedAt:null}},select:{role:true}})
      if(!member||!orgCan(member.role,'event:create'))throw errors.forbidden('Event creation requires organizer permission.')
      if(venueId&&!await tx.venue.findFirst({where:{id:venueId,orgId},select:{id:true}}))throw errors.badRequest('Choose a venue belonging to your organization.')
      const series=repeatWeeks?await tx.eventSeries.create({data:{
        orgId,title,slug:slug+'-series',description:common.summary,categorySlug:common.categorySlug,
        timezone,visibility,recurrence:JSON.stringify({freq:'WEEKLY',interval:1,count:repeatWeeks+1}),isActive:true,
      }}):null
      const event=await tx.event.create({data:{...common,seriesId:series?.id??null}})
      if(series)await tx.event.createMany({data:occurrences.map((timing,i)=>({...common,...timing,seriesId:series.id,slug:slug+'-w'+(i+2)}))})
      await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:user.email.slice(0,120),action:'event.create',entityType:'Event',entityId:event.id,after:JSON.stringify({title,seriesOccurrences:repeatWeeks})}})
      return jsonOk({event,seriesId:series?.id??null,occurrencesCreated:repeatWeeks})
    },{isolationLevel:'Serializable'})
  })
}
