import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { createOrgSchema, updateOrgSchema, inviteMemberSchema, updateMemberSchema } from '@ieventplux/contracts';
import { ROLE_PERMISSIONS } from '@ieventplux/contracts';
import { PrismaService } from '../../common/prisma.service.js';
import { AuthzService } from '../../common/authz.service.js';
import { AuditService } from '../../common/audit.service.js';
import { OutboxService } from '../../common/outbox.service.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import type { AuthContext } from '../../common/auth.js';

@Injectable()
export class OrgsService {
  constructor(private readonly prisma: PrismaService, private readonly authz: AuthzService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  async create(auth: AuthContext, input: z.infer<typeof createOrgSchema>) {
    if (await this.prisma.organization.findUnique({ where: { slug: input.slug } })) throw conflict('That URL handle is already taken');
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { ...input, ownerId: auth.user.id } });
      await tx.membership.create({ data: { orgId: org.id, userId: auth.user.id, role: 'OWNER', acceptedAt: new Date() } });
      await tx.ledgerAccount.createMany({ data: [
        { orgId: org.id, code: 'organizer_payable', type: 'LIABILITY', currency: 'GHS', name: `${org.name} payable` },
        { orgId: org.id, code: 'organizer_hold', type: 'LIABILITY', currency: 'GHS', name: `${org.name} holds` },
      ] });
      await this.audit.log({ actorUserId: auth.user.id, actorLabel: auth.user.email, action: 'org.create', entityType: 'Organization', entityId: org.id, after: { name: org.name, slug: org.slug } }, tx);
      return org;
    });
  }

  async mine(auth: AuthContext) {
    const memberships = await this.prisma.membership.findMany({ where: { userId: auth.user.id, acceptedAt: { not: null }, org: { deletedAt: null } }, include: { org: true } });
    return memberships.map((m) => ({ role: m.role, permissions: ROLE_PERMISSIONS[m.role], org: this.view(m.org) }));
  }
  async pendingInvites(auth: AuthContext) {
    return this.prisma.membership.findMany({ where: { userId: auth.user.id, acceptedAt: null }, include: { org: { select: { id: true, name: true, slug: true, logoUrl: true } } } });
  }
  async acceptInvite(auth: AuthContext, membershipId: string) {
    const m = await this.prisma.membership.findFirst({ where: { id: membershipId, userId: auth.user.id, acceptedAt: null } });
    if (!m) throw notFound('Invitation');
    return this.prisma.membership.update({ where: { id: m.id }, data: { acceptedAt: new Date() } });
  }

  async get(auth: AuthContext, orgId: string) {
    const m = await this.authz.requireOrg(auth, orgId, 'org.read');
    const org = await this.prisma.organization.findFirst({ where: { id: orgId, deletedAt: null }, include: { verification: true, _count: { select: { events: true, followers: true, memberships: true } } } });
    if (!org) throw notFound('Organization');
    return { ...this.view(org), verification: org.verification ? { status: org.verification.status, submittedAt: org.verification.submittedAt, notes: org.verification.notes } : null, counts: org._count, role: m.role, permissions: ROLE_PERMISSIONS[m.role] };
  }
  async publicProfile(slug: string) {
    const org = await this.prisma.organization.findFirst({ where: { slug, deletedAt: null, status: { not: 'SUSPENDED' } }, include: { _count: { select: { followers: true } } } });
    if (!org) throw notFound('Organizer');
    return { ...this.view(org), followers: org._count.followers };
  }
  async update(auth: AuthContext, orgId: string, input: z.infer<typeof updateOrgSchema>) {
    await this.authz.requireOrg(auth, orgId, 'org.settings');
    const before = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const org = await this.prisma.organization.update({ where: { id: orgId }, data: input });
    await this.audit.log({ actorUserId: auth.user.id, actorLabel: auth.user.email, action: 'org.update', entityType: 'Organization', entityId: orgId, before: pick(before, Object.keys(input)), after: pick(org, Object.keys(input)) });
    return this.view(org);
  }

  async members(auth: AuthContext, orgId: string) {
    await this.authz.requireOrg(auth, orgId, 'org.read');
    const rows = await this.prisma.membership.findMany({ where: { orgId }, include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } }, eventAssignments: { select: { eventId: true } } }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => ({ id: r.id, role: r.role, acceptedAt: r.acceptedAt, invitedAt: r.invitedAt, user: r.user, eventIds: r.eventAssignments.map((a) => a.eventId) }));
  }
  async invite(auth: AuthContext, orgId: string, input: z.infer<typeof inviteMemberSchema>) {
    await this.authz.requireOrg(auth, orgId, 'team.manage');
    const user = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user) throw badRequest('That person needs an iEventPlux account first. Ask them to register with this email.');
    if (await this.prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: user.id } } })) throw conflict('That person is already on the team');
    if (input.role === 'CHECKIN_STAFF' && !input.eventIds?.length) throw badRequest('Assign at least one event to check-in staff');
    const eventIds = await this.ownEventIds(orgId, input.eventIds ?? []);
    const m = await this.prisma.$transaction(async (tx) => {
      const created = await tx.membership.create({ data: { orgId, userId: user.id, role: input.role, eventAssignments: { create: eventIds.map((eventId) => ({ eventId })) } } });
      await tx.notification.create({ data: { userId: user.id, type: 'SYSTEM', title: 'You were invited to a team', body: `You have been invited to join a team as ${input.role.toLowerCase().replace('_', ' ')}.`, link: '/account/invites' } });
      await this.outbox.enqueue('SEND_MESSAGE', { kind: 'team_invite', channel: 'EMAIL', target: user.email, userId: user.id, templateVars: { orgId, role: input.role } }, {}, tx);
      await this.audit.log({ actorUserId: auth.user.id, actorLabel: auth.user.email, action: 'team.invite', entityType: 'Membership', entityId: created.id, after: { userId: user.id, role: input.role, eventIds } }, tx);
      return created;
    });
    return m;
  }
  async updateMember(auth: AuthContext, orgId: string, membershipId: string, input: z.infer<typeof updateMemberSchema>) {
    await this.authz.requireOrg(auth, orgId, 'team.manage');
    const m = await this.prisma.membership.findFirst({ where: { id: membershipId, orgId } });
    if (!m) throw notFound('Team member');
    if (m.role === 'OWNER') throw badRequest('The owner role cannot be changed here. Transfer ownership instead.');
    const eventIds = input.eventIds ? await this.ownEventIds(orgId, input.eventIds) : undefined;
    return this.prisma.$transaction(async (tx) => {
      if (eventIds) { await tx.eventStaff.deleteMany({ where: { membershipId } }); await tx.eventStaff.createMany({ data: eventIds.map((eventId) => ({ eventId, membershipId })) }); }
      const updated = await tx.membership.update({ where: { id: membershipId }, data: input.role ? { role: input.role } : {} });
      await this.audit.log({ actorUserId: auth.user.id, actorLabel: auth.user.email, action: 'team.update', entityType: 'Membership', entityId: membershipId, before: { role: m.role }, after: { role: updated.role, eventIds } }, tx);
      return updated;
    });
  }
  async removeMember(auth: AuthContext, orgId: string, membershipId: string) {
    await this.authz.requireOrg(auth, orgId, 'team.manage');
    const m = await this.prisma.membership.findFirst({ where: { id: membershipId, orgId } });
    if (!m) throw notFound('Team member');
    if (m.role === 'OWNER') throw badRequest('The owner cannot be removed');
    await this.prisma.membership.delete({ where: { id: membershipId } });
    await this.audit.log({ actorUserId: auth.user.id, actorLabel: auth.user.email, action: 'team.remove', entityType: 'Membership', entityId: membershipId, before: { userId: m.userId, role: m.role } });
  }
  async transferOwnership(auth: AuthContext, orgId: string, membershipId: string) {
    await this.authz.requireOrg(auth, orgId, 'org.settings');
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    if (org.ownerId !== auth.user.id) throw badRequest('Only the current owner can transfer ownership');
    const target = await this.prisma.membership.findFirst({ where: { id: membershipId, orgId, acceptedAt: { not: null } } });
    if (!target) throw notFound('Team member');
    await this.prisma.$transaction(async (tx) => {
      await tx.membership.updateMany({ where: { orgId, userId: auth.user.id }, data: { role: 'ADMIN' } });
      await tx.membership.update({ where: { id: target.id }, data: { role: 'OWNER' } });
      await tx.organization.update({ where: { id: orgId }, data: { ownerId: target.userId } });
      await this.audit.log({ actorUserId: auth.user.id, actorLabel: auth.user.email, action: 'org.transfer_ownership', entityType: 'Organization', entityId: orgId, before: { ownerId: auth.user.id }, after: { ownerId: target.userId } }, tx);
    });
  }

  private async ownEventIds(orgId: string, ids: string[]) {
    if (!ids.length) return [];
    const events = await this.prisma.event.findMany({ where: { id: { in: ids }, orgId, deletedAt: null }, select: { id: true } });
    if (events.length !== new Set(ids).size) throw badRequest('One or more events do not belong to this organization');
    return events.map((e) => e.id);
  }
  view(o: { id: string; name: string; slug: string; tagline: string | null; description: string | null; logoUrl: string | null; coverUrl: string | null; orgType: string; country: string; city: string | null; contactEmail: string | null; contactPhone: string | null; website: string | null; status: string; verifiedAt: Date | null; createdAt: Date }) {
    return { id: o.id, name: o.name, slug: o.slug, tagline: o.tagline, description: o.description, logoUrl: o.logoUrl, coverUrl: o.coverUrl, orgType: o.orgType, country: o.country, city: o.city, contactEmail: o.contactEmail, contactPhone: o.contactPhone, website: o.website, status: o.status, verified: !!o.verifiedAt, createdAt: o.createdAt };
  }
}
function pick(obj: Record<string, unknown>, keys: string[]) { return Object.fromEntries(keys.map((k) => [k, obj[k]])); }
