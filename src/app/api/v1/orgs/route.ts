import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, errors, sanitizeText } from '@/server/api'
import { db } from '@/lib/db'
import { getSession } from '@/server/auth'
import { organizationFields } from '@/server/org-metadata'
import { organizerType } from '@/lib/organization-types'
import { normalizeOrganizerDetails } from '@/server/org-profile-details'

/** POST /api/v1/orgs — create an organization (creator becomes OWNER; starts unverified). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    const body = await readJson<Record<string, unknown>>(req)
    const name = sanitizeText(body.name, 120)
    if (name.length < 3) throw errors.badRequest('Enter a public organizer or organization name (at least 3 characters).')
    const type = organizerType(body.orgType)
    if (!type) throw errors.badRequest('Choose a valid organizer type: Personal, Church, School, Business, Ministry or Association.')
    const publicFields = organizationFields(body)
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48)}-${Date.now().toString(36)}`
    const org = await db.organization.create({
      data: {
        name,
        slug,
        orgType: type,
        profileDetails: normalizeOrganizerDetails(body.profileDetails, type),
        tagline: sanitizeText(body.tagline, 160) || null,
        description: sanitizeText(body.description, 2000) || null,
        country: sanitizeText(body.country, 2).toUpperCase() || 'GH',
        city: sanitizeText(body.city, 60) || null,
        ...publicFields,
        // Personal organizers do not publish their private login email by default.
        contactEmail: publicFields.contactEmail ?? (type === 'INDIVIDUAL' ? null : user.email),
        contactPhone: sanitizeText(body.contactPhone, 24) || null,
        ownerId: user.id,
        status: 'PENDING_VERIFICATION',
      },
    })
    await db.membership.create({ data: { orgId: org.id, userId: user.id, role: 'OWNER', acceptedAt: new Date() } })
    await db.organizerVerification.create({ data: { orgId: org.id, status: 'PENDING', evidence: JSON.stringify([]) } })
    const { ensureOrgAccounts } = await import('@/server/ledger')
    await ensureOrgAccounts(org.id)
    const { audit } = await import('@/server/audit')
    await audit({ actorUserId: user.id, actorLabel: user.email, action: 'org.create', entityType: 'Organization', entityId: org.id, after: { name } })
    return jsonOk({ org, note: 'Verification required before paid ticket sales. Submit documents from the workspace.' })
  })
}

/** GET /api/v1/orgs — my organizations (switcher context). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    void req
    const session = await getSession()
    if (!session) return jsonOk({ items: [] })
    const { membershipsOf } = await import('@/server/permissions')
    return jsonOk({ items: await membershipsOf(session.user.id) })
  })
}
