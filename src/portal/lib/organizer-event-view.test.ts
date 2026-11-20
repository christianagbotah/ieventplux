import { describe, expect, test } from 'bun:test'
import { ORGANIZER_EVENT_FILTERS, eventMatchesView, eventStatusConfirmation, eventTransitionAllowed, filterOrganizerEvents, organizerEventCounts, isEventShareable, type OrganizerEventRow } from './organizer-event-view'

const base: OrganizerEventRow = {
  id:'1',title:'Shiloh Celebration',slug:'shiloh',status:'PUBLISHED',
  visibility:'PUBLIC',startsAt:'2026-12-01T08:00:00Z',endsAt:'2026-12-01T18:00:00Z',
  city:'Accra',categorySlug:'worship',
}
const now = Date.parse('2026-11-20T00:00:00Z')
const draft={...base,id:'2',status:'DRAFT',title:'New event'}
const postponed={...base,id:'3',status:'POSTPONED',title:'Delayed'}
const ended={...base,id:'4',status:'ENDED',startsAt:'2026-11-01T08:00:00Z',endsAt:'2026-11-01T16:00:00Z'}
const live={...base,id:'5',status:'LIVE',title:'Live workshop'}
const cancelled={...base,id:'6',status:'CANCELLED',title:'Cancelled festival'}
const events=[base,draft,postponed,ended,live,cancelled]

describe('Organizer event control center', () => {
  test('all management tabs classify real states without calling drafts public', () => {
    expect(organizerEventCounts(events,now)).toEqual({ALL:6,ATTENTION:2,UPCOMING:1,LIVE:1,PAST:2})
    expect(ORGANIZER_EVENT_FILTERS).toHaveLength(5)
  })
  test('search is case-insensitive across title, city and category', () => {
    expect(filterOrganizerEvents(events,{view:'ALL',query:'SHILOH',now}).map(e=>e.id)).toEqual(['1','4'])
    expect(filterOrganizerEvents(events,{view:'ATTENTION',query:'Delayed',now}).map(e=>e.id)).toEqual(['3'])
    expect(filterOrganizerEvents(events,{view:'LIVE',query:'accra',now}).map(e=>e.id)).toEqual(['5'])
  })
  test('upcoming excludes stale published events', () => {
    const stale={...base,id:'7',startsAt:'2026-11-01T08:00:00Z',endsAt:'2026-11-01T09:00:00Z'}
    expect(eventMatchesView(stale,'UPCOMING',now)).toBe(false)
    expect(eventMatchesView(stale,'PAST',now)).toBe(true)
  })
  test('share only genuinely public, active event pages', () => {
    expect(isEventShareable(base)).toBe(true)
    expect(isEventShareable({...base,visibility:'INVITE_ONLY'})).toBe(false)
    expect(isEventShareable(draft)).toBe(false)
    expect(isEventShareable(cancelled)).toBe(false)
  })
  test('event manager may publish but cannot postpone/cancel', () => {
    expect(eventTransitionAllowed('EVENT_MANAGER','DRAFT','PUBLISHED')).toBe(true)
    expect(eventTransitionAllowed('EVENT_MANAGER','PUBLISHED','POSTPONED')).toBe(false)
    expect(eventTransitionAllowed('EVENT_MANAGER','PUBLISHED','CANCELLED')).toBe(false)
    expect(eventTransitionAllowed('OWNER','PUBLISHED','POSTPONED')).toBe(true)
    expect(eventTransitionAllowed('ADMIN','PUBLISHED','CANCELLED')).toBe(true)
    expect(eventTransitionAllowed('ANALYST','DRAFT','PUBLISHED')).toBe(false)
  })
  test('status prompts clarify refund and communications obligations', () => {
    expect(eventStatusConfirmation('CANCELLED').description).toContain('does not automatically complete refunds')
    expect(eventStatusConfirmation('POSTPONED').description).toContain('communicate')
    expect(eventStatusConfirmation('PUBLISHED').description).toContain('Verify')
  })
})
