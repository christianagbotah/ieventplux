import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { errors } from '@/server/api'
import {
  canSeeCompetitionResults, canVoteInCompetition, effectiveCompetitionStatus,
  parseCompetitionDraft, type CompetitionDraft,
} from '@/server/competition-policy'
import { realtimeEmit } from './realtime'
import {engagementAccess} from '../engagement-access'

/**
 * Organizer-created, durable awards and supporter voting.
 * This first release accepts FREE votes only. Paid voting must never be
 * considered settled merely because a checkout request was submitted.
 */
export type CompetitionView = {
  id: string
  eventId: string
  title: string
  description: string | null
  status: string
  votingMethod: 'FREE'
  resultsVisibility: string
  votingStartsAt: string
  votingEndsAt: string
  canVote: boolean
  countsVisible: boolean
  totalVotes: number | null
  categories: {
    id: string; title: string; position: number; myNomineeId: string | null
    totalVotes: number | null
    nominees: { id: string; name: string; bio: string | null; photoUrl: string | null; position: number; votes: number | null }[]
  }[]
}

async function listEventCompetitions(
  eventId: string, viewerId: string | null, organizer: boolean, eventStatus: string, client:Prisma.TransactionClient,
): Promise<CompetitionView[]> {
  const contests = await client.eventCompetition.findMany({
    where: { eventId, ...(organizer ? {} : { status: { in: ['OPEN', 'CLOSED'] } }) },
    orderBy: [{ createdAt: 'desc' }],
    include: {
      categories: { orderBy: { position: 'asc' }, include: { nominees: { orderBy: { position: 'asc' } } } },
    },
  })
  if (!contests.length) return []
  const ids = contests.map(c => c.id)
  const [counts, personalVotes] = await Promise.all([
    client.competitionVote.groupBy({
      by: ['competitionId', 'categoryId', 'nomineeId'],
      where: { competitionId: { in: ids } },
      _count: { _all: true },
    }),
    viewerId ? client.competitionVote.findMany({
      where: { competitionId: { in: ids }, userId: viewerId },
      select: { categoryId: true, nomineeId: true },
    }) : Promise.resolve([]),
  ])
  const countByNominee = new Map<string, number>(counts.map(c => [c.nomineeId, c._count._all] as const))
  const myByCategory = new Map<string, string>(personalVotes.map(v => [v.categoryId, v.nomineeId] as const))
  const now = new Date()
  return contests.map(c => {
    const countsVisible = canSeeCompetitionResults({
      organizer, status: c.status, resultsVisibility: c.resultsVisibility, endsAt: c.votingEndsAt, now,
    })
    return {
      id: c.id, eventId: c.eventId, title: c.title, description: c.description,
      status: effectiveCompetitionStatus(c.status, c.votingEndsAt, now),
      votingMethod: 'FREE' as const,
      resultsVisibility: c.resultsVisibility,
      votingStartsAt: c.votingStartsAt.toISOString(),
      votingEndsAt: c.votingEndsAt.toISOString(),
      canVote: canVoteInCompetition({
        status: c.status, startsAt: c.votingStartsAt, endsAt: c.votingEndsAt, eventStatus, now,
      }),
      countsVisible,
      totalVotes: countsVisible
        ? c.categories.reduce((total, cat) => total + cat.nominees.reduce((n, nominee) => n + (countByNominee.get(nominee.id) ?? 0), 0), 0)
        : null,
      categories: c.categories.map(category => ({
        id: category.id, title: category.title, position: category.position,
        myNomineeId: myByCategory.get(category.id) ?? null,
        totalVotes: countsVisible ? category.nominees.reduce((n, nominee) => n + (countByNominee.get(nominee.id) ?? 0), 0) : null,
        nominees: category.nominees.map(nominee => ({
          id: nominee.id, name: nominee.name, bio: nominee.bio, photoUrl: nominee.photoUrl,
          position: nominee.position, votes: countsVisible ? (countByNominee.get(nominee.id) ?? 0) : null,
        })),
      })),
    }
  })
}

export async function competitionSnapshot(eventId:string,viewerId:string|null){
 return db.$transaction(async tx=>{
  const {event,organizer}=await engagementAccess(eventId,viewerId,tx)
  return {competitions:await listEventCompetitions(eventId,viewerId,organizer,event.status,tx),canManage:organizer,paidVotingEnabled:false}
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}
async function requireCompetitionOrganizer(tx:Prisma.TransactionClient,eventId:string,actorId:string){
 const {event,organizer}=await engagementAccess(eventId,actorId,tx)
 if(!organizer)throw errors.forbidden('Organizer permission required.')
 return event
}
async function competitionAudit(tx:Prisma.TransactionClient,actorId:string,id:string,action:string){
 // Never include the category or nominee in a vote audit; preserve ballot privacy.
 await tx.auditLog.create({data:{actorUserId:actorId,actorLabel:'competition-account',entityType:'EventCompetition',entityId:id,action:'competition.'+action}})
}
function concurrentChange(err:unknown){return !!err&&typeof err==='object'&&'code' in err&&err.code==='P2034'}

export async function createEventCompetition(
  eventId: string, actorId: string, rawDraft: unknown,
) {
  const input: CompetitionDraft = parseCompetitionDraft(rawDraft)
  try{return await db.$transaction(async tx=>{
  const event=await requireCompetitionOrganizer(tx,eventId,actorId)
  if(event.status==='CANCELLED')throw errors.conflict('Cannot create awards for a cancelled event.')
  const row=await tx.eventCompetition.create({
    data: {
      eventId, title: input.title, description: input.description,
      createdBy: actorId, status: 'DRAFT', votingMethod: 'FREE',
      votingStartsAt: input.votingStartsAt, votingEndsAt: input.votingEndsAt,
      resultsVisibility: input.resultsVisibility,
      categories: {
        create: input.categories.map((category, position) => ({
          title: category.title, position,
          nominees: { create: category.nominees.map((nominee, nomineePosition) => ({
            ...nominee, position: nomineePosition,
          })) },
        })),
      },
    },
    select: { id: true, title: true, status: true, eventId: true },
  })
  await competitionAudit(tx,actorId,row.id,'create')
  return row
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(err){if(concurrentChange(err))throw errors.conflict('Competition changed. Refresh and retry.');throw err}
}

/**
 * Draft-only replacement of categories and nominees. Never edit ballots
 * after voting opens; even a successful close does not permit re-editing.
 */
export async function reviseDraftCompetition(id: string, actorId:string, rawDraft: unknown) {
  const input = parseCompetitionDraft(rawDraft)
  try {
    return await db.$transaction(async tx => {
      const existing = await tx.eventCompetition.findUnique({
        where: { id }, select: { id: true, status: true, eventId: true },
      })
      if (!existing) throw errors.notFound('Competition not found.')
      await requireCompetitionOrganizer(tx,existing.eventId,actorId)
      if (existing.status !== 'DRAFT') throw errors.conflict('Published competitions and nominees cannot be edited after voting opens.')
      const votes = await tx.competitionVote.count({ where: { competitionId: id } })
      if (votes !== 0) throw errors.conflict('Competition nominations are locked because votes exist.')
      const changed = await tx.eventCompetition.updateMany({
        where: { id, status: 'DRAFT' },
        data: {
          title: input.title, description: input.description,
          votingStartsAt: input.votingStartsAt, votingEndsAt: input.votingEndsAt,
          resultsVisibility: input.resultsVisibility,
        },
      })
      if (changed.count !== 1) throw errors.conflict('Voting status changed. Refresh and try again.')
      await tx.competitionCategory.deleteMany({ where: { competitionId: id } })
      for (const [position, category] of input.categories.entries()) {
        await tx.competitionCategory.create({
          data: {
            competitionId: id, title: category.title, position,
            nominees: { create: category.nominees.map((nominee, nomineePosition) => ({
              ...nominee, position: nomineePosition,
            })) },
          },
        })
      }
      await competitionAudit(tx,actorId,id,'draft_edit')
      return { id, eventId: existing.eventId, status: 'DRAFT' }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2034')
      throw errors.conflict('Another organizer changed the competition. Refresh and try again.')
    throw err
  }
}

/** Draft deletion never deletes ballots; open/closed competitions are retained. */
export async function discardDraftCompetition(id: string,actorId:string) {
  try {
    return await db.$transaction(async tx => {
      const contest = await tx.eventCompetition.findUnique({
        where: { id }, select: { id: true, eventId: true, status: true },
      })
      if (!contest) throw errors.notFound('Competition not found.')
      await requireCompetitionOrganizer(tx,contest.eventId,actorId)
      if (contest.status !== 'DRAFT') throw errors.conflict('Open or completed competitions cannot be removed.')
      const votes = await tx.competitionVote.count({ where: { competitionId: id } })
      if (votes !== 0) throw errors.conflict('Votes exist; this competition cannot be removed.')
      await tx.eventCompetition.delete({ where: { id } })
      await competitionAudit(tx,actorId,id,'draft_delete')
      return { removed: true, eventId: contest.eventId }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2034')
      throw errors.conflict('Competition was modified. Refresh and retry.')
    throw err
  }
}

export async function changeCompetitionStatus(
  id: string, actorId: string, target: 'OPEN' | 'CLOSED',
) {
  const result = await db.$transaction(async tx => {
    const contest = await tx.eventCompetition.findUnique({
      where: { id }, select: {
        id: true, eventId: true, status: true, votingStartsAt: true, votingEndsAt: true,
        event: { select: { status: true, deletedAt: true } },
      },
    })
    if (!contest || contest.event.deletedAt) throw errors.notFound('Competition not found.')
    await requireCompetitionOrganizer(tx,contest.eventId,actorId)
    const now = new Date()
    if (target === 'OPEN') {
      if (contest.status !== 'DRAFT') throw errors.conflict('Only a draft competition can be opened.')
      if (contest.votingEndsAt <= now) throw errors.conflict('This voting window has expired.')
      if (!['PUBLISHED', 'LIVE', 'ENDED'].includes(contest.event.status))
        throw errors.conflict('Publish the event before opening its competition.')
    } else if (contest.status !== 'OPEN') throw errors.conflict('Only an open competition can be closed.')

    const updated = await tx.eventCompetition.updateMany({
      where: { id, status: target === 'OPEN' ? 'DRAFT' : 'OPEN' },
      data: target === 'OPEN' ? { status: 'OPEN', openedAt: now } : { status: 'CLOSED', closedAt: now },
    })
    if (updated.count !== 1) throw errors.conflict('Competition status changed. Refresh and try again.')
    await competitionAudit(tx,actorId,id,target==='OPEN'?'open':'close')
    return { competitionId: id, eventId: contest.eventId, status: target, actorId }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(err=>{if(concurrentChange(err))throw errors.conflict('Voting status changed. Refresh and try again.');throw err})
  await realtimeEmit('event:' + result.eventId, 'competition:changed', {})
  return result
}

function isUniqueVoteViolation(err: unknown) {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002')
}

/** Exactly one vote per account and award category, enforced by PostgreSQL. */
export async function castCompetitionVote(args: {
  competitionId: string; categoryId: string; nomineeId: string; userId: string
}) {
  if (!args.categoryId || !args.nomineeId) throw errors.badRequest('Choose a nominee and award category.')
  let result: { competitionId: string; categoryId: string; nomineeId: string; eventId: string }
  try {
    result = await db.$transaction(async tx => {
      const competition = await tx.eventCompetition.findUnique({
        where: { id: args.competitionId },
        select: { eventId: true, status: true, votingMethod: true,
          votingStartsAt: true, votingEndsAt: true,
          event: { select: { status: true, deletedAt: true } },
        },
      })
      if (!competition || competition.event.deletedAt) throw errors.notFound('Competition not found.')
      await engagementAccess(competition.eventId,args.userId,tx)
      if(!await tx.user.findFirst({where:{id:args.userId,status:'ACTIVE',deletedAt:null},select:{id:true}}))throw errors.unauthorized()
      if (competition.votingMethod !== 'FREE')
        throw errors.conflict('Paid voting is not available in this release.')
      if (!canVoteInCompetition({
        status: competition.status, startsAt: competition.votingStartsAt,
        endsAt: competition.votingEndsAt, eventStatus: competition.event.status,
      })) throw errors.conflict('Voting is closed or has not started yet.')
      const category = await tx.competitionCategory.findFirst({
        where: { id: args.categoryId, competitionId: args.competitionId },
        select: { id: true },
      })
      if (!category) throw errors.badRequest('This award category does not belong to the competition.')
      const nominee = await tx.competitionNominee.findFirst({
        where: { id: args.nomineeId, categoryId: category.id },
        select: { id: true },
      })
      if (!nominee) throw errors.badRequest('This nominee does not belong to the award category.')
      await tx.competitionVote.create({
        data: { competitionId: args.competitionId, categoryId: category.id,
          nomineeId: nominee.id, userId: args.userId },
      })
      await competitionAudit(tx,args.userId,args.competitionId,'vote')
      return { competitionId: args.competitionId, categoryId: category.id,
        nomineeId: nominee.id, eventId: competition.eventId }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch (err) {
    if (isUniqueVoteViolation(err)) throw errors.conflict('You have already voted in this award category.')
    // PostgreSQL SERIALIZABLE may abort a simultaneous request before it
    // reaches the UNIQUE index. This is a user-visible conflict, not a 500.
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2034')
      throw errors.conflict('Another vote or status change was processed first. Refresh and retry.')
    throw err
  }
  // Do not leak rankings via WebSocket before organizer's reveal setting.
  await realtimeEmit('event:' + result.eventId, 'competition:changed', {})
  return { accepted: true, competitionId: result.competitionId,
    categoryId: result.categoryId, nomineeId: result.nomineeId }
}
