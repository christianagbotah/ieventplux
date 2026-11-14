import { db } from '../lib/db'

/**
 * Permission model (see docs/PERMISSIONS.md).
 * Platform roles are stored on User.role; organization roles on Membership.role.
 * A caller-supplied organization id NEVER establishes authorization — it is only
 * used to scope queries after membership has been proven from the session.
 */

export const PLATFORM_ROLES = ['USER', 'SUPPORT', 'MODERATOR', 'FINANCE_ADMIN', 'SUPER_ADMIN'] as const
export const ORG_ROLES = ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'FINANCE', 'CHECKIN_STAFF', 'ANALYST'] as const

export type PlatformRole = (typeof PLATFORM_ROLES)[number]
export type OrgRole = (typeof ORG_ROLES)[number]

const HIERARCHY: Record<OrgRole, number> = { OWNER: 60, ADMIN: 50, EVENT_MANAGER: 40, FINANCE: 40, CHECKIN_STAFF: 20, ANALYST: 10 }

export const ORG_PERMISSIONS = {
  'org:manage': ['OWNER', 'ADMIN'] as OrgRole[],
  'org:manage_team': ['OWNER', 'ADMIN'] as OrgRole[],
  'org:manage_payouts': ['OWNER', 'ADMIN', 'FINANCE'] as OrgRole[],
  'org:view_finance': ['OWNER', 'ADMIN', 'FINANCE', 'ANALYST'] as OrgRole[],
  'event:create': ['OWNER', 'ADMIN', 'EVENT_MANAGER'] as OrgRole[],
  'event:edit': ['OWNER', 'ADMIN', 'EVENT_MANAGER'] as OrgRole[],
  'event:publish': ['OWNER', 'ADMIN', 'EVENT_MANAGER'] as OrgRole[],
  'event:cancel': ['OWNER', 'ADMIN'] as OrgRole[],
  'tickets:manage': ['OWNER', 'ADMIN', 'EVENT_MANAGER'] as OrgRole[],
  'orders:view': ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'FINANCE', 'ANALYST'] as OrgRole[],
  'attendees:view': ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'CHECKIN_STAFF'] as OrgRole[],
  'checkin:scan': ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'CHECKIN_STAFF'] as OrgRole[],
  'broadcast:manage': ['OWNER', 'ADMIN', 'EVENT_MANAGER'] as OrgRole[],
  'messages:send': ['OWNER', 'ADMIN', 'EVENT_MANAGER'] as OrgRole[],
  'promotions:manage': ['OWNER', 'ADMIN', 'EVENT_MANAGER'] as OrgRole[],
  'media:manage': ['OWNER', 'ADMIN', 'EVENT_MANAGER'] as OrgRole[],
  'refund:request': ['OWNER', 'ADMIN', 'FINANCE'] as OrgRole[],
}

export type OrgPermission = keyof typeof ORG_PERMISSIONS

export function orgCan(role: string, permission: OrgPermission): boolean {
  return (ORG_PERMISSIONS[permission] as readonly string[]).includes(role)
}

export function roleAtLeast(role: string, minimum: OrgRole): boolean {
  const r = HIERARCHY[role as OrgRole] ?? 0
  return r >= HIERARCHY[minimum]
}

export const PLATFORM_PERMISSIONS = {
  'admin:console': ['SUPPORT', 'MODERATOR', 'FINANCE_ADMIN', 'SUPER_ADMIN'] as PlatformRole[],
  'admin:moderate': ['MODERATOR', 'SUPER_ADMIN'] as PlatformRole[],
  'admin:finance': ['FINANCE_ADMIN', 'SUPER_ADMIN'] as PlatformRole[],
  'admin:settings': ['SUPER_ADMIN'] as PlatformRole[],
  'admin:users': ['SUPPORT', 'SUPER_ADMIN'] as PlatformRole[],
}

export type PlatformPermission = keyof typeof PLATFORM_PERMISSIONS

export function platformCan(role: string, permission: PlatformPermission): boolean {
  return (PLATFORM_PERMISSIONS[permission] as readonly string[]).includes(role)
}

export interface OrgMembershipInfo {
  orgId: string
  role: OrgRole
  orgName: string
  orgSlug: string
  orgStatus: string
}

/** Resolve the caller's membership for the given organization (server-side only). */
export async function membershipFor(userId: string, orgId: string): Promise<OrgMembershipInfo | null> {
  const m = await db.membership.findFirst({
    where: { userId, orgId, acceptedAt: { not: null }, org: { deletedAt: null } },
    include: { org: true },
  })
  if (!m) return null
  return { orgId, role: m.role as OrgRole, orgName: m.org.name, orgSlug: m.org.slug, orgStatus: m.org.status }
}

export async function membershipsOf(userId: string): Promise<OrgMembershipInfo[]> {
  const rows = await db.membership.findMany({ where: { userId, acceptedAt: { not: null }, org: { deletedAt: null } }, include: { org: true } })
  return rows.map((m) => ({ orgId: m.orgId, role: m.role as OrgRole, orgName: m.org.name, orgSlug: m.org.slug, orgStatus: m.org.status }))
}

/** Event org scoping: fetch event and verify the caller's org membership in one step. */
export async function eventOrgAccess(userId: string, eventId: string, permission: OrgPermission) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, orgId: true, status: true, visibility: true, slug: true, title: true } })
  if (!event) return { event: null, membership: null, allowed: false }
  const membership = await membershipFor(userId, event.orgId)
  const allowed = Boolean(membership && orgCan(membership.role, permission))
  return { event, membership, allowed }
}
