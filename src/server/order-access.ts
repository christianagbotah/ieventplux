import { membershipFor, orgCan } from './permissions'

/**
 * Full customer order details include buyer identity, issued ticket credentials
 * and payment state. Collection and venue check-in staff use their dedicated
 * minimal lookup endpoints and NEVER receive full order details by knowing an
 * order reference. An invited but unaccepted org member cannot view anything.
 */
export async function canReadFullOrder(viewerId: string, order: { userId: string | null; orgId: string }): Promise<boolean> {
  if (order.userId === viewerId) return true
  const membership = await membershipFor(viewerId, order.orgId)
  return Boolean(membership && orgCan(membership.role, 'orders:view'))
}
