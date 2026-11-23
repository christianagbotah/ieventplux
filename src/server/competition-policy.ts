/**
 * Awards voting is an independent contest domain, not an ephemeral one-question
 * live poll. Only verified free votes are currently accepted. Paid votes must
 * wait for an idempotent provider-settlement ledger and refunds.
 */
export type NomineeDraft = { name: string; bio: string | null; photoUrl: string | null }
export type CategoryDraft = { title: string; nominees: NomineeDraft[] }
export type CompetitionDraft = {
  title: string
  description: string | null
  votingStartsAt: Date
  votingEndsAt: Date
  resultsVisibility: 'LIVE' | 'AFTER_CLOSE' | 'HIDDEN'
  categories: CategoryDraft[]
}

export class CompetitionPolicyError extends Error {}

function text(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maximum + 1) : ''
}

function safeImageUrl(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.length > 1800) throw new CompetitionPolicyError('Nominee image URL is invalid.')
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:' || u.username || u.password || u.hash) throw new Error('bad protocol')
    return u.href
  } catch {
    throw new CompetitionPolicyError('Nominee images must use valid HTTPS addresses.')
  }
}

export function parseCompetitionDraft(raw: unknown, now = new Date()): CompetitionDraft {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CompetitionPolicyError('Competition details are required.')
  const x = raw as Record<string, unknown>
  if (x.votingMethod !== undefined && x.votingMethod !== 'FREE')
    throw new CompetitionPolicyError('Paid voting is not available until payment settlement and refunds are certified.')
  const title = text(x.title, 120)
  if (title.length < 4 || title.length > 120) throw new CompetitionPolicyError('Competition title must be 4–120 characters.')
  const description = text(x.description, 1200) || null
  if (description && description.length > 1200) throw new CompetitionPolicyError('Description must be 1,200 characters or less.')
  const resultsVisibility = x.resultsVisibility ?? 'AFTER_CLOSE'
  if (resultsVisibility !== 'LIVE' && resultsVisibility !== 'AFTER_CLOSE' && resultsVisibility !== 'HIDDEN')
    throw new CompetitionPolicyError('Choose a valid voting results setting.')
  const from = typeof x.votingStartsAt === 'string' ? new Date(x.votingStartsAt) : new Date(Number.NaN)
  const to = typeof x.votingEndsAt === 'string' ? new Date(x.votingEndsAt) : new Date(Number.NaN)
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()))
    throw new CompetitionPolicyError('Voting start and end dates must be valid.')
  if (from.getTime() < now.getTime() - 120_000)
    throw new CompetitionPolicyError('Voting cannot start in the past.')
  if (to.getTime() <= from.getTime() + 5 * 60_000)
    throw new CompetitionPolicyError('Voting must last longer than five minutes.')
  if (to.getTime() - from.getTime() > 370 * 86_400_000)
    throw new CompetitionPolicyError('A competition cannot run longer than 370 days.')
  if (!Array.isArray(x.categories) || x.categories.length < 1 || x.categories.length > 12)
    throw new CompetitionPolicyError('An award needs between 1 and 12 categories.')
  const uniqueCategories = new Set<string>()
  let totalNominees = 0
  const categories = x.categories.map((entry): CategoryDraft => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new CompetitionPolicyError('Category details are invalid.')
    const category = entry as Record<string, unknown>
    const categoryTitle = text(category.title, 90)
    if (categoryTitle.length < 2 || categoryTitle.length > 90) throw new CompetitionPolicyError('Category name must be 2–90 characters.')
    const key = categoryTitle.toLocaleLowerCase('en')
    if (uniqueCategories.has(key)) throw new CompetitionPolicyError('Award categories must have unique names.')
    uniqueCategories.add(key)
    if (!Array.isArray(category.nominees) || category.nominees.length < 2 || category.nominees.length > 24)
      throw new CompetitionPolicyError('Every award category needs 2–24 nominees.')
    totalNominees += category.nominees.length
    const uniqueNominees = new Set<string>()
    const nominees = category.nominees.map((entry): NomineeDraft => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry))
        throw new CompetitionPolicyError('Nominee details are invalid.')
      const item = entry as Record<string, unknown>
      const name = text(item.name, 100)
      if (name.length < 2 || name.length > 100) throw new CompetitionPolicyError('Nominee name must be 2–100 characters.')
      const nameKey = name.toLocaleLowerCase('en')
      if (uniqueNominees.has(nameKey)) throw new CompetitionPolicyError('Nominees must be unique within each category.')
      uniqueNominees.add(nameKey)
      const bio = text(item.bio, 450) || null
      if (bio && bio.length > 450) throw new CompetitionPolicyError('Nominee description is too long.')
      return { name, bio, photoUrl: safeImageUrl(item.photoUrl) }
    })
    return { title: categoryTitle, nominees }
  })
  if (totalNominees > 150) throw new CompetitionPolicyError('A competition supports up to 150 nominees.')
  return { title, description, votingStartsAt: from, votingEndsAt: to, resultsVisibility, categories }
}

export function effectiveCompetitionStatus(status: string, endsAt: Date, now = new Date()): string {
  return status === 'OPEN' && now >= endsAt ? 'CLOSED' : status
}

export function canVoteInCompetition(args: {
  status: string; startsAt: Date; endsAt: Date; eventStatus: string; now?: Date
}) {
  const now = args.now ?? new Date()
  return args.status === 'OPEN' && now >= args.startsAt && now < args.endsAt
    && ['PUBLISHED', 'LIVE', 'ENDED'].includes(args.eventStatus)
}

export function canSeeCompetitionResults(args: {
  organizer: boolean; status: string; resultsVisibility: string; endsAt: Date; now?: Date
}): boolean {
  if (args.organizer) return true
  if (args.resultsVisibility === 'HIDDEN') return false
  if (args.resultsVisibility === 'LIVE') return args.status !== 'DRAFT'
  return effectiveCompetitionStatus(args.status, args.endsAt, args.now) === 'CLOSED'
}
