/** Pure policy shared by event-update delivery and regression tests.
 * The service must supply only current valid tickets / approved RSVPs.
 * Never treat an organization follow or old order as private-event entitlement.
 */
type AccountRow = { userId: string | null }
type FollowerRow = { followerId: string }

export function eventUpdateAudience(input: {
  privateEvent: boolean
  authorId: string
  holders: readonly AccountRow[]
  buyers: readonly AccountRow[]
  followers: readonly FollowerRow[]
  approvals: readonly AccountRow[]
}): Set<string> {
  const audience = new Set<string>()
  for (const h of input.holders) if (h.userId) audience.add(h.userId)
  if (input.privateEvent) {
    for (const r of input.approvals) if (r.userId) audience.add(r.userId)
  } else {
    for (const b of input.buyers) if (b.userId) audience.add(b.userId)
    for (const f of input.followers) audience.add(f.followerId)
  }
  audience.delete(input.authorId)
  return audience
}

export function eventUpdateNotice(privateEvent: boolean, important: boolean, title: string, body: string) {
  if (privateEvent) return {
    title: important ? 'Important private event update' : 'Private event update',
    body: 'Sign in and open the event to view the latest update.',
    sms: 'iEventPlux: Important private event update. Sign in to view it.',
  }
  return {
    title: important ? 'Important update — ' + title : title,
    body: body.slice(0, 200),
    sms: 'iEventPlux — ' + title + ': ' + body.slice(0, 120) + (body.length > 120 ? '…' : ''),
  }
}
