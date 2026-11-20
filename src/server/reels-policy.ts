/**
 * Public clip recommendations cannot expose private, unpublished or unrelated
 * next occurrences. This pure policy is shared by the API and unit tests.
 */
type Candidate = {
  id: string
  slug: string
  title: string
  orgId: string
  visibility: string
  status: string
  deletedAt: Date | string | null
}

export function publicNextOccurrence(clipOrgId: string, next: Candidate | null) {
  if (!next || next.orgId !== clipOrgId || next.visibility !== 'PUBLIC'
    || next.deletedAt !== null || !['PUBLISHED', 'LIVE', 'POSTPONED'].includes(next.status)) {
    return null
  }
  return { id: next.id, slug: next.slug, title: next.title }
}
