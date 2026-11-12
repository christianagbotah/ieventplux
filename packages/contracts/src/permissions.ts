export const MEMBERSHIP_ROLES = ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'FINANCE', 'CHECKIN_STAFF', 'ANALYST'] as const;
export type MembershipRoleName = (typeof MEMBERSHIP_ROLES)[number];
export const PLATFORM_ROLES = ['NONE', 'SUPPORT', 'MODERATOR', 'FINANCE_ADMIN', 'SUPER_ADMIN'] as const;
export type PlatformRoleName = (typeof PLATFORM_ROLES)[number];

export const PERMISSIONS = [
  'org.read', 'org.settings', 'team.manage', 'verification.submit',
  'event.read', 'event.write', 'event.publish', 'event.cancel', 'media.manage', 'invitation.manage',
  'ticket_type.manage', 'order.read', 'attendee.read', 'attendee.export',
  'checkin.scan', 'checkin.roster',
  'finance.read', 'refund.request', 'payout.request', 'payout.destination',
  'subscription.manage', 'message.send', 'broadcast.manage', 'broadcast.keys', 'promotion.manage', 'analytics.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];
const EVENT_OPS: Permission[] = ['org.read', 'event.read', 'event.write', 'event.publish', 'event.cancel', 'media.manage', 'invitation.manage', 'ticket_type.manage', 'order.read', 'attendee.read', 'attendee.export', 'checkin.scan', 'checkin.roster', 'message.send', 'broadcast.manage', 'promotion.manage', 'analytics.read'];

export const ROLE_PERMISSIONS: Record<MembershipRoleName, readonly Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((p) => p !== 'payout.destination'),
  EVENT_MANAGER: EVENT_OPS,
  FINANCE: ['org.read', 'event.read', 'order.read', 'finance.read', 'refund.request', 'payout.request', 'subscription.manage', 'analytics.read'],
  // CHECKIN_STAFF permissions are additionally scoped to assigned events (EventStaff).
  CHECKIN_STAFF: ['org.read', 'event.read', 'checkin.scan', 'checkin.roster', 'attendee.read'],
  ANALYST: ['org.read', 'event.read', 'order.read', 'attendee.read', 'finance.read', 'analytics.read'],
};

/** Permissions that are restricted to specific events for event-scoped roles. */
export const EVENT_SCOPED_ROLES: readonly MembershipRoleName[] = ['CHECKIN_STAFF'];

export function roleHas(role: MembershipRoleName, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Platform staff capabilities. Platform access is narrowly scoped and must be audited with a reason. */
export const PLATFORM_CAPABILITIES = [
  'platform.users', 'platform.orgs', 'platform.events', 'platform.moderation', 'platform.plans', 'platform.fees',
  'platform.payments', 'platform.refunds', 'platform.payouts', 'platform.promotions', 'platform.streams',
  'platform.notifications', 'platform.integrations', 'platform.settings', 'platform.audit', 'platform.support_read',
] as const;
export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number];
export const PLATFORM_ROLE_CAPABILITIES: Record<PlatformRoleName, readonly PlatformCapability[]> = {
  NONE: [],
  SUPPORT: ['platform.support_read', 'platform.users', 'platform.orgs', 'platform.events', 'platform.notifications'],
  MODERATOR: ['platform.support_read', 'platform.moderation', 'platform.events', 'platform.users', 'platform.orgs'],
  FINANCE_ADMIN: ['platform.support_read', 'platform.payments', 'platform.refunds', 'platform.payouts', 'platform.fees', 'platform.plans', 'platform.orgs', 'platform.audit'],
  SUPER_ADMIN: [...PLATFORM_CAPABILITIES],
};
/** Capabilities that always require step-up (recent password re-authentication). */
export const ELEVATION_REQUIRED: readonly PlatformCapability[] = ['platform.refunds', 'platform.payouts', 'platform.fees', 'platform.settings'];
export const ORG_ELEVATION_REQUIRED: readonly Permission[] = ['payout.request', 'payout.destination', 'refund.request'];
