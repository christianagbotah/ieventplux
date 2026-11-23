/**
 * Native social presentation guards. Authorization is always server-side;
 * these rules additionally prevent stale or accidental private UI exposure.
 */
import type { CommunityComment, CommunityThreadPage, EventNetworkResponse, NetworkMember } from '../api/client'

export function validCommunityPost(value: string): boolean {
  const length = value.trim().length
  return length >= 2 && length <= 1000
}
export function communityCanPost(eventStatus: string): boolean {
  return ['PUBLISHED', 'LIVE', 'POSTPONED', 'ENDED'].includes(eventStatus)
}
export function communityUnavailableStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 404
}
export function mergeCommunityThreads(
  previous: CommunityComment[], next: CommunityThreadPage, append: boolean,
): CommunityComment[] {
  if (!append) return next.items
  const seen = new Set(previous.map((entry) => entry.id))
  return [...previous, ...next.items.filter((entry) => !seen.has(entry.id))]
}
export function visibleEventNetwork(response: EventNetworkResponse): NetworkMember[] {
  // API is authoritative, but a stale previous roster must never be rendered
  // on a fresh, non-consented response.
  return response.eligible && response.optedIn ? response.items : []
}
export function mergeNetworkMembers(previous: NetworkMember[], next: NetworkMember[], append: boolean): NetworkMember[] {
  if (!append) return next
  const seen = new Set(previous.map((member) => member.id))
  return [...previous, ...next.filter((member) => !seen.has(member.id))]
}
