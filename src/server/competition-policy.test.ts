import { expect, test } from 'bun:test'
import { CompetitionPolicyError, canSeeCompetitionResults, canVoteInCompetition, effectiveCompetitionStatus, parseCompetitionDraft } from './competition-policy'

const now = new Date('2026-11-23T12:00:00.000Z')
const start = '2026-11-23T12:10:00.000Z'
const end = '2026-11-30T12:10:00.000Z'
const base = {
 title: 'Ghana Cultural Talent Awards', votingStartsAt:start, votingEndsAt:end,
 categories:[{ title:'Best Performer', nominees:[{name:'Artist A'}, {name:'Artist B'}] }],
}
test('parses valid categories and nominee records, defaulting to hidden-until-close results',()=>{
 const result=parseCompetitionDraft(base,now)
 expect(result.categories[0].nominees.length).toBe(2)
 expect(result.resultsVisibility).toBe('AFTER_CLOSE')
 expect(result.votingEndsAt.toISOString()).toBe(end)
})
test('rejects paid votes without a settlement-backed ledger',()=>{
 expect(()=>parseCompetitionDraft({...base,votingMethod:'PAID'},now)).toThrow(CompetitionPolicyError)
})
test('prevents duplicate nominee names within a category even across case',()=>{
 expect(()=>parseCompetitionDraft({...base,categories:[{title:'Best Performer',nominees:[{name:'A Star'},{name:'a star'}]}]},now)).toThrow()
})
test('prevents duplicate category names and empty ballots',()=>{
 expect(()=>parseCompetitionDraft({...base,categories:[base.categories[0],{...base.categories[0],title:'best performer'}]},now)).toThrow()
 expect(()=>parseCompetitionDraft({...base,categories:[]},now)).toThrow()
})
test('requires valid future voting windows',()=>{
 expect(()=>parseCompetitionDraft({...base,votingStartsAt:'yesterday'},now)).toThrow()
 expect(()=>parseCompetitionDraft({...base,votingEndsAt:'2026-11-23T12:12:00Z'},now)).toThrow()
})
test('forbids untrusted nominee photo schemes',()=>{
 expect(()=>parseCompetitionDraft({...base,categories:[{title:'Best',nominees:[{name:'Artist A',photoUrl:'http://example.com/p.png'},{name:'Artist B'}]}]},now)).toThrow()
})
test('only open competitions accept votes in the time window',()=>{
 const options={status:'OPEN',startsAt:new Date(start),endsAt:new Date(end),eventStatus:'LIVE'}
 expect(canVoteInCompetition({...options,now:new Date(start)})).toBe(true)
 expect(canVoteInCompetition({...options,now:new Date(end)})).toBe(false)
 expect(canVoteInCompetition({...options,now, status:'DRAFT'})).toBe(false)
 expect(canVoteInCompetition({...options,now:new Date(start),eventStatus:'CANCELLED'})).toBe(false)
})
test('public vote totals remain hidden until permitted',()=>{
 const options={organizer:false,status:'OPEN',resultsVisibility:'AFTER_CLOSE',endsAt:new Date(end)}
 expect(canSeeCompetitionResults({...options,now:new Date(start)})).toBe(false)
 expect(canSeeCompetitionResults({...options,now:new Date(end)})).toBe(true)
 expect(canSeeCompetitionResults({...options,resultsVisibility:'HIDDEN',now:new Date(end)})).toBe(false)
 expect(canSeeCompetitionResults({...options,organizer:true})).toBe(true)
 expect(effectiveCompetitionStatus('OPEN',new Date(end),new Date(end))).toBe('CLOSED')
})
