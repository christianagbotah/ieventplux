import { db } from '../../lib/db'
import { errors } from '../api'
import { realtimeEmit } from './realtime'

/**
 * Live engagement domain: realtime polls + audience Q&A for LIVE events.
 *
 * Contract (mirrors the platform's honesty rules):
 *  - Durable state always lives in the DB; the realtime relay is best-effort.
 *  - One vote per signed-in person per poll (unique index, 409 on race).
 *  - A poll can only be OPENed while its event is LIVE; opening a new poll
 *    auto-closes any other open poll of the same event (one question at a time).
 *  - Q&A accepts questions while an event is PUBLISHED or LIVE (fans arrive early).
 *  - DRAFT polls and HIDDEN questions are organizer-only surfaces.
 */

const STATUS_ORDER: Record<string, number> = { OPEN: 0, CLOSED: 1, DRAFT: 2 }

export interface PollOptionView {
  id: string
  text: string
  position: number
  votes: number
}

export interface PollView {
  id: string
  eventId: string
  question: string
  status: string // DRAFT | OPEN | CLOSED
  openedAt: string | null
  closedAt: string | null
  createdAt: string
  totalVotes: number
  myOptionId: string | null // null = current viewer has not voted (or is anonymous)
  options: PollOptionView[]
}

export interface QuestionView {
  id: string
  body: string
  status: string // NEW | ANSWERED | HIDDEN
  answer: string | null
  answeredAt: string | null
  pinned: boolean
  createdAt: string
  author: { id: string; displayName: string }
  upvotes: number
  myUpvote: boolean
  isMine: boolean
}

async function requireEvent(eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, orgId: true, status: true, startsAt: true, endsAt: true, visibility: true, deletedAt: true } })
  if (!event || event.deletedAt) throw errors.notFound('Event not found.')
  return event
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002')
}

// ─────────────────────────────── Polls ───────────────────────────────

export async function listPolls(eventId: string, viewerUserId: string | null, isOrg: boolean): Promise<PollView[]> {
  const polls = await db.livePoll.findMany({
    where: { eventId, ...(isOrg ? {} : { status: { in: ['OPEN', 'CLOSED'] } }) },
    include: { options: { orderBy: { position: 'asc' } } },
  })
  if (polls.length === 0) return []

  const [voteCounts, myVotes] = await Promise.all([
    db.livePollVote.groupBy({ by: ['pollId', 'optionId'], where: { pollId: { in: polls.map((p) => p.id) } }, _count: { _all: true } }),
    viewerUserId
      ? db.livePollVote.findMany({ where: { userId: viewerUserId, pollId: { in: polls.map((p) => p.id) } }, select: { pollId: true, optionId: true } })
      : Promise.resolve([] as { pollId: string; optionId: string }[]),
  ])

  const countByOption = new Map(voteCounts.map((c) => [c.optionId, c._count._all]))
  const myOptionByPoll = new Map(myVotes.map((v) => [v.pollId, v.optionId]))

  return polls
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || (b.closedAt?.getTime() ?? b.createdAt.getTime()) - (a.closedAt?.getTime() ?? a.createdAt.getTime()))
    .map((p) => {
      const options = p.options.map((o) => ({ id: o.id, text: o.text, position: o.position, votes: countByOption.get(o.id) ?? 0 }))
      return {
        id: p.id,
        eventId: p.eventId,
        question: p.question,
        status: p.status,
        openedAt: p.openedAt?.toISOString() ?? null,
        closedAt: p.closedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        totalVotes: options.reduce((sum, o) => sum + o.votes, 0),
        myOptionId: myOptionByPoll.get(p.id) ?? null,
        options,
      }
    })
}

export async function createPoll(params: { eventId: string; userId: string; question: string; options: string[] }): Promise<PollView> {
  const event = await requireEvent(params.eventId)
  if (['ENDED', 'CANCELLED'].includes(event.status)) throw errors.conflict('Polls cannot be created for ended or cancelled events.')

  const question = params.question.trim().slice(0, 140)
  if (question.length < 4) throw errors.badRequest('Poll question needs at least 4 characters.')
  const options = [...new Set(params.options.map((o) => o.trim().slice(0, 40)).filter(Boolean))]
  if (options.length < 2 || options.length > 6) throw errors.badRequest('A poll needs between 2 and 6 distinct options.')

  const poll = await db.livePoll.create({
    data: { eventId: params.eventId, question, createdBy: params.userId, status: 'DRAFT', options: { create: options.map((text, position) => ({ text, position })) } },
    include: { options: { orderBy: { position: 'asc' } } },
  })
  return toView(poll)
}

function toView(poll: { id: string; eventId: string; question: string; status: string; openedAt: Date | null; closedAt: Date | null; createdAt: Date; options: { id: string; text: string; position: number }[] }, extra?: Partial<PollView>): PollView {
  return {
    id: poll.id,
    eventId: poll.eventId,
    question: poll.question,
    status: poll.status,
    openedAt: poll.openedAt?.toISOString() ?? null,
    closedAt: poll.closedAt?.toISOString() ?? null,
    createdAt: poll.createdAt.toISOString(),
    totalVotes: 0,
    myOptionId: null,
    options: poll.options.map((o) => ({ id: o.id, text: o.text, position: o.position, votes: 0 })),
    ...extra,
  }
}

export async function setPollStatus(params: { pollId: string; to: 'OPEN' | 'CLOSED'; userId: string }) {
  const poll = await db.livePoll.findUnique({ where: { id: params.pollId }, include: { options: { orderBy: { position: 'asc' } } } })
  if (!poll) throw errors.notFound('Poll not found.')
  const event = await requireEvent(poll.eventId)

  if (params.to === 'OPEN') {
    if (event.status !== 'LIVE') throw errors.conflict('Polls can only be opened while the event is live.')
    if (poll.status === 'CLOSED') throw errors.conflict('This poll is already closed.')
    // One open question at a time — auto-close any other open poll of this event.
    await db.livePoll.updateMany({ where: { eventId: poll.eventId, status: 'OPEN', id: { not: poll.id } }, data: { status: 'CLOSED', closedAt: new Date() } })
    const updated = await db.livePoll.update({ where: { id: poll.id }, data: { status: 'OPEN', openedAt: new Date(), closedAt: null }, include: { options: { orderBy: { position: 'asc' } } } })
    const view = await completeView(updated)
    await realtimeEmit(`event:${poll.eventId}`, 'poll:update', { poll: view })
    await realtimeEmit(`event:${poll.eventId}`, 'poll:closed-others', { exceptPollId: poll.id })
    return { poll: view }
  }

  if (poll.status !== 'OPEN') throw errors.conflict('Only open polls can be closed.')
  const updated = await db.livePoll.update({ where: { id: poll.id }, data: { status: 'CLOSED', closedAt: new Date() }, include: { options: { orderBy: { position: 'asc' } } } })
  const view = await completeView(updated)
  await realtimeEmit(`event:${poll.eventId}`, 'poll:update', { poll: view })
  return { poll: view }
}

/** toView + real tallies — the shape every poll:update broadcast must carry
 *  (clients replace their local poll wholesale, so tallies must never be zeroed). */
async function completeView(poll: { id: string; eventId: string; question: string; status: string; openedAt: Date | null; closedAt: Date | null; createdAt: Date; options: { id: string; text: string; position: number }[] }): Promise<PollView> {
  const tallies = await tally(poll.id)
  return { ...toView(poll), options: tallies.options, totalVotes: tallies.totalVotes }
}

export async function castVote(params: { pollId: string; optionId: string; userId: string }) {
  const poll = await db.livePoll.findUnique({ where: { id: params.pollId }, include: { options: true } })
  if (!poll) throw errors.notFound('Poll not found.')
  if (poll.status !== 'OPEN') throw errors.conflict('This poll is closed.')
  const event = await requireEvent(poll.eventId)
  if (event.status !== 'LIVE') throw errors.conflict('Voting is only available while the event is live.')
  const option = poll.options.find((o) => o.id === params.optionId)
  if (!option || option.pollId !== poll.id) throw errors.badRequest('Unknown poll option.')

  try {
    await db.livePollVote.create({ data: { pollId: poll.id, optionId: option.id, userId: params.userId } })
  } catch (err) {
    if (isUniqueViolation(err)) throw errors.conflict('You have already voted in this poll.')
    throw err
  }

  // Broadcast the fresh tallies to everyone in the event room (honest counts
  // always recomputed from the DB, never accumulated client-side).
  const tallies = await tally(poll.id)
  await realtimeEmit(`event:${poll.eventId}`, 'poll:vote', { pollId: poll.id, tallies, totalVotes: tallies.totalVotes })
  return { tallies, myOptionId: option.id }
}

async function tally(pollId: string) {
  const counts = await db.livePollVote.groupBy({ by: ['optionId'], where: { pollId }, _count: { _all: true } })
  const options = await db.livePollOption.findMany({ where: { pollId }, orderBy: { position: 'asc' } })
  const map = new Map(counts.map((c) => [c.optionId, c._count._all]))
  const result = options.map((o) => ({ id: o.id, text: o.text, position: o.position, votes: map.get(o.id) ?? 0 }))
  return { pollId, options: result, totalVotes: result.reduce((sum, o) => sum + o.votes, 0) }
}

// ─────────────────────────────── Audience Q&A ───────────────────────────────

export async function listQuestions(eventId: string, viewerUserId: string | null, isOrg: boolean): Promise<QuestionView[]> {
  const rows = await db.audienceQuestion.findMany({
    where: { eventId, ...(isOrg ? {} : { status: { in: ['NEW', 'ANSWERED'] } }) },
    include: { author: { select: { id: true, displayName: true } } },
  })
  if (rows.length === 0) return []

  const [upvoteCounts, myUpvotes] = await Promise.all([
    db.audienceQuestionUpvote.groupBy({ by: ['questionId'], where: { questionId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }),
    viewerUserId
      ? db.audienceQuestionUpvote.findMany({ where: { userId: viewerUserId, questionId: { in: rows.map((r) => r.id) } }, select: { questionId: true } })
      : Promise.resolve([] as { questionId: string }[]),
  ])
  const countByQuestion = new Map(upvoteCounts.map((c) => [c.questionId, c._count._all]))
  const mine = new Set(myUpvotes.map((u) => u.questionId))

  return rows
    .map((q) => ({
      id: q.id,
      body: q.body,
      status: q.status,
      answer: q.answer,
      answeredAt: q.answeredAt?.toISOString() ?? null,
      pinned: q.pinned,
      createdAt: q.createdAt.toISOString(),
      author: { id: q.author.id, displayName: q.author.displayName },
      upvotes: countByQuestion.get(q.id) ?? 0,
      myUpvote: mine.has(q.id),
      isMine: viewerUserId === q.userId,
    }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.status === 'ANSWERED' ? 1 : 0) - (b.status === 'ANSWERED' ? 1 : 0) || b.upvotes - a.upvotes || a.createdAt.localeCompare(b.createdAt))
}

export async function askQuestion(params: { eventId: string; userId: string; body: string }): Promise<QuestionView> {
  const event = await requireEvent(params.eventId)
  if (!['PUBLISHED', 'LIVE'].includes(event.status)) throw errors.conflict('Questions can only be asked around published or live events.')
  const body = params.body.trim().slice(0, 280)
  if (body.length < 6) throw errors.badRequest('Question needs at least 6 characters.')

  const row = await db.audienceQuestion.create({
    data: { eventId: params.eventId, userId: params.userId, body },
    include: { author: { select: { id: true, displayName: true } } },
  })
  const view: QuestionView = {
    id: row.id, body: row.body, status: row.status, answer: null, answeredAt: null, pinned: false,
    createdAt: row.createdAt.toISOString(), author: { id: row.author.id, displayName: row.author.displayName }, upvotes: 0, myUpvote: false, isMine: true,
  }
  await realtimeEmit(`event:${params.eventId}`, 'qa:new', { question: view })
  return view
}

export async function toggleUpvote(params: { questionId: string; userId: string }) {
  const question = await db.audienceQuestion.findUnique({ where: { id: params.questionId } })
  if (!question || question.status === 'HIDDEN') throw errors.notFound('Question not found.')
  if (question.userId === params.userId) throw errors.conflict('Upvoting your own question is disabled.')

  const existing = await db.audienceQuestionUpvote.findUnique({ where: { questionId_userId: { questionId: params.questionId, userId: params.userId } } })
  if (existing) {
    await db.audienceQuestionUpvote.delete({ where: { id: existing.id } })
  } else {
    try {
      await db.audienceQuestionUpvote.create({ data: { questionId: params.questionId, userId: params.userId } })
    } catch (err) {
      if (isUniqueViolation(err)) { /* concurrent toggle-off already removed it */ } else throw err
    }
  }
  const count = await db.audienceQuestionUpvote.count({ where: { questionId: params.questionId } })
  await realtimeEmit(`event:${question.eventId}`, 'qa:upvote', { questionId: params.questionId, upvotes: count })
  return { upvoted: !existing, upvotes: count }
}

export async function answerQuestion(params: { questionId: string; userId: string; answer: string }) {
  const question = await db.audienceQuestion.findUnique({ where: { id: params.questionId } })
  if (!question) throw errors.notFound('Question not found.')
  const answer = params.answer.trim().slice(0, 600)
  if (answer.length < 2) throw errors.badRequest('Answer needs at least 2 characters.')

  const row = await db.audienceQuestion.update({
    where: { id: params.questionId },
    data: { status: 'ANSWERED', answer, answeredById: params.userId, answeredAt: new Date() },
    include: { author: { select: { id: true, displayName: true } } },
  })
  const view: QuestionView = {
    id: row.id, body: row.body, status: row.status, answer: row.answer, answeredAt: row.answeredAt?.toISOString() ?? null,
    pinned: row.pinned, createdAt: row.createdAt.toISOString(), author: { id: row.author.id, displayName: row.author.displayName },
    upvotes: await db.audienceQuestionUpvote.count({ where: { questionId: params.questionId } }), myUpvote: false, isMine: false,
  }
  await realtimeEmit(`event:${question.eventId}`, 'qa:update', { question: view })
  return { question: view }
}

export async function moderateQuestion(params: { questionId: string; action: 'HIDE' | 'UNHIDE' | 'PIN' | 'UNPIN' }) {
  const question = await db.audienceQuestion.findUnique({ where: { id: params.questionId } })
  if (!question) throw errors.notFound('Question not found.')

  const data: { status?: string; pinned?: boolean } = {}
  if (params.action === 'HIDE') data.status = 'HIDDEN'
  if (params.action === 'UNHIDE') data.status = 'NEW'
  if (params.action === 'PIN') data.pinned = true
  if (params.action === 'UNPIN') data.pinned = false

  const row = await db.audienceQuestion.update({ where: { id: params.questionId }, data, include: { author: { select: { id: true, displayName: true } } } })
  const view: QuestionView = {
    id: row.id, body: row.body, status: row.status, answer: row.answer, answeredAt: row.answeredAt?.toISOString() ?? null,
    pinned: row.pinned, createdAt: row.createdAt.toISOString(), author: { id: row.author.id, displayName: row.author.displayName },
    upvotes: await db.audienceQuestionUpvote.count({ where: { questionId: params.questionId } }), myUpvote: false, isMine: false,
  }
  await realtimeEmit(`event:${question.eventId}`, 'qa:update', { question: view })
  return { question: view }
}
