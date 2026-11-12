import { Injectable } from '@nestjs/common';
import { ORG_ELEVATION_REQUIRED, roleHas, EVENT_SCOPED_ROLES, type Permission, PLATFORM_ROLE_CAPABILITIES, type PlatformCapability, ELEVATION_REQUIRED } from '@ieventplux/contracts';
import type { Membership } from '@ieventplux/db';
import { PrismaService } from './prisma.service.js';
import { AppError, forbidden } from './errors.js';
import { type AuthContext, requireElevation } from './auth.js';

/** Authorization always derives the organization from the loaded resource, never from caller-supplied IDs. */
@Injectable()
export class AuthzService {
  constructor(private readonly prisma: PrismaService) {}

  async membership(auth: AuthContext, orgId: string): Promise<Membership | null> {
    return this.prisma.membership.findFirst({ where: { orgId, userId: auth.user.id, acceptedAt: { not: null }, org: { deletedAt: null } } });
  }

  /** Throws unless the caller holds `permission` in `orgId` (optionally scoped to `eventId` for event-scoped roles). */
  async requireOrg(auth: AuthContext, orgId: string, permission: Permission, eventId?: string): Promise<Membership> {
    const m = await this.membership(auth, orgId);
    if (!m || !roleHas(m.role, permission)) throw forbidden();
    if (EVENT_SCOPED_ROLES.includes(m.role)) {
      if (!eventId) throw forbidden('This role only has access to assigned events');
      const assigned = await this.prisma.eventStaff.findUnique({ where: { eventId_membershipId: { eventId, membershipId: m.id } } });
      if (!assigned) throw forbidden('You are not assigned to this event');
    }
    if (ORG_ELEVATION_REQUIRED.includes(permission)) requireElevation(auth);
    return m;
  }

  async requireEvent(auth: AuthContext, eventId: string, permission: Permission) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
    if (!event) throw new AppError('NOT_FOUND', 'Event not found');
    const m = await this.requireOrg(auth, event.orgId, permission, eventId);
    return { event, membership: m };
  }

  hasPlatform(auth: AuthContext, cap: PlatformCapability) { return PLATFORM_ROLE_CAPABILITIES[auth.user.platformRole].includes(cap); }
  requirePlatform(auth: AuthContext, cap: PlatformCapability) {
    if (!this.hasPlatform(auth, cap)) throw forbidden('Platform access required');
    if (ELEVATION_REQUIRED.includes(cap)) requireElevation(auth);
  }
  /** Org IDs where the user has any accepted membership (for listing workspaces). */
  async orgIds(auth: AuthContext) { return (await this.prisma.membership.findMany({ where: { userId: auth.user.id, acceptedAt: { not: null } }, select: { orgId: true } })).map((m) => m.orgId); }
}
