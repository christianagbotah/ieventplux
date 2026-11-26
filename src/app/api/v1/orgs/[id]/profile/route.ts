import { NextRequest } from 'next/server'
import { handle, jsonOk, errors, requireUser, readJson, sanitizeText, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'
import { organizerType } from '@/lib/organization-types'
import type { Prisma } from '@prisma/client'
import { editableOrganizer } from '@/server/org-profile-access'
import { organizationFields } from '@/server/org-metadata'
import { publicOrganizerDetails, readOrganizerDetails, normalizeOrganizerDetails } from '@/server/org-profile-details'

/** GET /api/v1/orgs/[slug]/profile — public organizer profile + public events only. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    void req
    const { id } = await ctx.params
    const org = await db.organization.findUnique({ where: { slug: id } })
    if (!org || org.deletedAt) throw errors.notFound('Organizer not found.')
    const session = await getSession()
    const myOrg = Boolean(session && (session.user.id === org.ownerId ||
      await db.membership.findFirst({ where: { orgId: org.id, userId: session.user.id, acceptedAt: { not: null } }, select: { id: true } })))
    const canEdit = Boolean(session && await db.organization.findFirst({where:{id:org.id,...editableOrganizer(session.user.id)},select:{id:true}}))
    const following = session && !myOrg ? Boolean(await db.follow.findFirst({ where: { followerId: session.user.id, orgId: org.id } })) : false
    // Only PUBLIC events appear on public organizer profiles (unlisted/invited never leak).
    const events = await db.event.findMany({
      where: { orgId: org.id, visibility: 'PUBLIC', deletedAt: null, status: { in: ['PUBLISHED', 'LIVE', 'POSTPONED', 'ENDED'] } },
      orderBy: { startsAt: 'desc' },
      take: 24,
      select: { id: true, slug: true, title: true, summary: true, coverImageUrl: true, startsAt: true, city: true, mode: true, status: true, categorySlug: true, ticketTypes: { select: { priceMinor: true }, where: { active: true } } },
    })
    const followers = await db.follow.count({ where: { orgId: org.id } })
    const clips = await db.mediaAsset.findMany({
      where: { orgId: org.id, kind: 'CLIP', status: 'READY',
        event: { visibility: 'PUBLIC', deletedAt: null, status: { in: ['PUBLISHED', 'LIVE', 'ENDED'] } },
        org: { status: 'ACTIVE', deletedAt: null },
      }, orderBy: { createdAt: 'desc' }, take: 8,
    })
    return jsonOk({
      org: {
        id: org.id, name: org.name, slug: org.slug, tagline: org.tagline, description: org.description,
        logoUrl: org.logoUrl, coverUrl: org.coverUrl, orgType: org.orgType, profileDetails: publicOrganizerDetails(org.profileDetails, org.orgType), city: org.city, country: org.country,
        website: org.website, contactEmail: org.contactEmail, contactPhone: org.contactPhone,
        address: org.address, mapsUrl: org.mapsUrl, latitude: org.latitude, longitude: org.longitude,
        socialLinks: JSON.parse(org.socialLinks || '{}'),
        verifiedAt: org.verifiedAt, verified: Boolean(org.verifiedAt),
      },
      events, followers, following, myOrg, canEdit, clips,
    }, {headers:{'Cache-Control':'private, no-store'}})
  })
}

/** PATCH only public profile fields; never accepts identity status, KYC, payout or image URLs. */
export async function PATCH(req:NextRequest,ctx:{params:Promise<{id:string}>}){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'org-profile-edit',20,60000)
  const {id}=await ctx.params
  const org=await db.organization.findFirst({where:{slug:id,...editableOrganizer(user.id)}})
  if(!org)throw errors.forbidden('Only the organizer owner or an authorized administrator may edit this profile.')
  const body=await readJson<Record<string,unknown>>(req)
  const data:Prisma.OrganizationUpdateManyMutationInput=organizationFields(body)
  if(body.name!==undefined){
   const name=sanitizeText(body.name,120)
   if(name.length<3)throw errors.badRequest('Enter a public name of at least 3 characters.')
   if(org.verifiedAt&&name!==org.name)throw errors.forbidden('Verified names require identity review. Contact support to request a name change.')
   if(name!==org.name)data.name=name
  }
  if(body.tagline!==undefined)data.tagline=sanitizeText(body.tagline,160)||null
  if(body.description!==undefined)data.description=sanitizeText(body.description,2000)||null
  if(body.city!==undefined)data.city=sanitizeText(body.city,60)||null
  if(body.contactPhone!==undefined)data.contactPhone=sanitizeText(body.contactPhone,24)||null
  if(body.profileDetails!==undefined){
   const type=organizerType(org.orgType)
   if(!type)throw errors.badRequest('Unsupported organizer category.')
   const incoming=body.profileDetails
   if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))throw errors.badRequest('Invalid profile details.')
   // Retain the private registration number; this public editor cannot modify it.
   const details={...incoming as Record<string,unknown>}
   delete details.registrationNumber
   const old=readOrganizerDetails(org.profileDetails,org.orgType)
   data.profileDetails=normalizeOrganizerDetails({...old,...details},type)
  }
  await db.$transaction(async tx=>{
   const changed=await tx.organization.updateMany({where:{id:org.id,...editableOrganizer(user.id),updatedAt:org.updatedAt},data})
   if(changed.count!==1)throw errors.conflict('Profile changed. Refresh and try again.')
   await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'profile-editor',action:'org.profile.update',entityType:'Organization',entityId:org.id,after:JSON.stringify({fields:Object.keys(data)})}})
  })
  return jsonOk({ok:true},{headers:{'Cache-Control':'private, no-store'}})
 })
}
