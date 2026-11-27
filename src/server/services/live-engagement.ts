import { db } from '../../lib/db'
import type {Prisma} from '@prisma/client'
import {engagementAccess} from '../engagement-access'
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

async function atomic<T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
 try{return await db.$transaction(fn,{isolationLevel:'Serializable'})}
 catch(err){if(err&&typeof err==='object'&&'code' in err&&err.code==='P2034')throw errors.conflict('Engagement changed. Refresh and try again.');throw err}
}
async function requireOrganizer(eventId:string,userId:string,tx:Prisma.TransactionClient){
 const access=await engagementAccess(eventId,userId,tx)
 if(!access.organizer)throw errors.forbidden('Only event organizers can manage engagement.')
 return access.event
}
/** Room-wide messages carry no private questions, votes or viewer state. */
const changed=(eventId:string)=>realtimeEmit(`event:${eventId}`,'engagement:changed',{})

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
  const question = params.question.trim().slice(0, 140)
  if (question.length < 4) throw errors.badRequest('Poll question needs at least 4 characters.')
  const options = [...new Set(params.options.map((o) => o.trim().slice(0, 40)).filter(Boolean))]
  if (options.length < 2 || options.length > 6) throw errors.badRequest('A poll needs between 2 and 6 distinct options.')

  return atomic(async tx=>{
    const event=await requireOrganizer(params.eventId,params.userId,tx)
    if(['ENDED','CANCELLED'].includes(event.status))throw errors.conflict('Polls cannot be created for ended or cancelled events.')
    const poll=await tx.livePoll.create({data:{eventId:params.eventId,question,createdBy:params.userId,status:'DRAFT',options:{create:options.map((text,position)=>({text,position}))}},include:{options:{orderBy:{position:'asc'}}}})
    return toView(poll)
  })
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

export async function setPollStatus(params:{pollId:string;to:'OPEN'|'CLOSED';userId:string}){
 const result=await atomic(async tx=>{
  const poll=await tx.livePoll.findUnique({where:{id:params.pollId},include:{options:{orderBy:{position:'asc'}}}})
  if(!poll)throw errors.notFound('Poll not found.')
  const event=await requireOrganizer(poll.eventId,params.userId,tx)
  const now=new Date()
  if(params.to==='OPEN'){
   if(event.status!=='LIVE')throw errors.conflict('Polls can only be opened while the event is live.')
   if(poll.status!=='DRAFT')throw errors.conflict('Only a draft poll can be opened.')
   await tx.livePoll.updateMany({where:{eventId:poll.eventId,status:'OPEN',id:{not:poll.id}},data:{status:'CLOSED',closedAt:now}})
  }else if(poll.status!=='OPEN')throw errors.conflict('Only open polls can be closed.')
  const updated=await tx.livePoll.update({where:{id:poll.id},data:params.to==='OPEN'?{status:'OPEN',openedAt:now,closedAt:null}:{status:'CLOSED',closedAt:now},include:{options:{orderBy:{position:'asc'}}}})
  const tallies=await tally(poll.id,tx)
  return {poll:{...toView(updated),options:tallies.options,totalVotes:tallies.totalVotes}}
 })
 await changed(result.poll.eventId)
 return result
}

export async function castVote(params:{pollId:string;optionId:string;userId:string}){
 try{
  const result=await atomic(async tx=>{
   const poll=await tx.livePoll.findUnique({where:{id:params.pollId},include:{options:true}})
   if(!poll)throw errors.notFound('Poll not found.')
   const {event}=await engagementAccess(poll.eventId,params.userId,tx)
   if(poll.status!=='OPEN'||event.status!=='LIVE')throw errors.conflict('Voting is only available in open polls while the event is live.')
   const option=poll.options.find(o=>o.id===params.optionId)
   if(!option)throw errors.badRequest('Unknown poll option.')
   await tx.livePollVote.create({data:{pollId:poll.id,optionId:option.id,userId:params.userId}})
   return {eventId:poll.eventId,tallies:await tally(poll.id,tx),myOptionId:option.id}
  })
  await changed(result.eventId)
  return {tallies:result.tallies,myOptionId:result.myOptionId}
 }catch(err){if(isUniqueViolation(err))throw errors.conflict('You have already voted in this poll.');throw err}
}

async function tally(pollId: string,tx:Prisma.TransactionClient) {
  const counts = await tx.livePollVote.groupBy({ by: ['optionId'], where: { pollId }, _count: { _all: true } })
  const options = await tx.livePollOption.findMany({ where: { pollId }, orderBy: { position: 'asc' } })
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
  const body = params.body.trim().slice(0, 280)
  if (body.length < 6) throw errors.badRequest('Question needs at least 6 characters.')

  const row=await atomic(async tx=>{
    const {event}=await engagementAccess(params.eventId,params.userId,tx)
    if(!['PUBLISHED','LIVE'].includes(event.status))throw errors.conflict('Questions can only be asked around published or live events.')
    return tx.audienceQuestion.create({data:{eventId:params.eventId,userId:params.userId,body},include:{author:{select:{id:true,displayName:true}}}})
  })
  const view: QuestionView = {
    id: row.id, body: row.body, status: row.status, answer: null, answeredAt: null, pinned: false,
    createdAt: row.createdAt.toISOString(), author: { id: row.author.id, displayName: row.author.displayName }, upvotes: 0, myUpvote: false, isMine: true,
  }
  await changed(params.eventId)
  return view
}

export async function toggleUpvote(params:{questionId:string;userId:string}){
 const result=await atomic(async tx=>{
  const question=await tx.audienceQuestion.findUnique({where:{id:params.questionId}})
  if(!question||question.status==='HIDDEN')throw errors.notFound('Question not found.')
  const {event}=await engagementAccess(question.eventId,params.userId,tx)
  if(!['PUBLISHED','LIVE'].includes(event.status))throw errors.conflict('This Q&A is read-only.')
  if(question.userId===params.userId)throw errors.conflict('Upvoting your own question is disabled.')
  const existing=await tx.audienceQuestionUpvote.findUnique({where:{questionId_userId:{questionId:params.questionId,userId:params.userId}}})
  if(existing)await tx.audienceQuestionUpvote.delete({where:{id:existing.id}})
  else await tx.audienceQuestionUpvote.create({data:{questionId:params.questionId,userId:params.userId}})
  return {eventId:question.eventId,upvoted:!existing,upvotes:await tx.audienceQuestionUpvote.count({where:{questionId:params.questionId}})}
 })
 await changed(result.eventId)
 return {upvoted:result.upvoted,upvotes:result.upvotes}
}

export async function answerQuestion(params: { questionId: string; userId: string; answer: string }) {
  const question = await db.audienceQuestion.findUnique({ where: { id: params.questionId } })
  if (!question) throw errors.notFound('Question not found.')
  const answer = params.answer.trim().slice(0, 600)
  if (answer.length < 2) throw errors.badRequest('Answer needs at least 2 characters.')

  const row=await atomic(async tx=>{
   await requireOrganizer(question.eventId,params.userId,tx)
   return tx.audienceQuestion.update({where:{id:params.questionId},data:{status:'ANSWERED',answer,answeredById:params.userId,answeredAt:new Date()},include:{author:{select:{id:true,displayName:true}}}})
  })
  const view: QuestionView = {
    id: row.id, body: row.body, status: row.status, answer: row.answer, answeredAt: row.answeredAt?.toISOString() ?? null,
    pinned: row.pinned, createdAt: row.createdAt.toISOString(), author: { id: row.author.id, displayName: row.author.displayName },
    upvotes: await db.audienceQuestionUpvote.count({ where: { questionId: params.questionId } }), myUpvote: false, isMine: false,
  }
  await changed(question.eventId)
  return { question: view }
}

export async function moderateQuestion(params: { questionId: string; userId:string; action: 'HIDE' | 'UNHIDE' | 'PIN' | 'UNPIN' }) {
  const question = await db.audienceQuestion.findUnique({ where: { id: params.questionId } })
  if (!question) throw errors.notFound('Question not found.')

  const data: { status?: string; pinned?: boolean } = {}
  if (params.action === 'HIDE') data.status = 'HIDDEN'
  if (params.action === 'UNHIDE') data.status = 'NEW'
  if (params.action === 'PIN') data.pinned = true
  if (params.action === 'UNPIN') data.pinned = false

  const row=await atomic(async tx=>{
   await requireOrganizer(question.eventId,params.userId,tx)
   return tx.audienceQuestion.update({where:{id:params.questionId},data,include:{author:{select:{id:true,displayName:true}}}})
  })
  const view: QuestionView = {
    id: row.id, body: row.body, status: row.status, answer: row.answer, answeredAt: row.answeredAt?.toISOString() ?? null,
    pinned: row.pinned, createdAt: row.createdAt.toISOString(), author: { id: row.author.id, displayName: row.author.displayName },
    upvotes: await db.audienceQuestionUpvote.count({ where: { questionId: params.questionId } }), myUpvote: false, isMine: false,
  }
  await changed(question.eventId)
  return { question: view }
}
