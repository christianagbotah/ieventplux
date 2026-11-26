import { describe, expect, test } from 'bun:test'
import { demandIsOpen, hasDemandEntitlement, reminderNotice, waitlistNotice } from './event-demand-policy'

describe('event demand policy', () => {
  const now = new Date('2026-11-26T10:00:00Z')
  const future = new Date('2026-11-27T10:00:00Z')
  const published = { status: 'PUBLISHED', startsAt: future, deletedAt: null }
  test('only future published, nondeleted events accept new demand', () => {
    expect(demandIsOpen(published, now)).toBe(true)
    for (const status of ['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED', 'POSTPONED']) {
      expect(demandIsOpen({ ...published, status }, now)).toBe(false)
    }
    expect(demandIsOpen({ ...published, startsAt: now }, now)).toBe(false)
    expect(demandIsOpen({ ...published, deletedAt: now }, now)).toBe(false)
  })
  test('private demand requires authenticated current admission', () => {
    expect(hasDemandEntitlement('INVITE_ONLY', {})).toBe(false)
    expect(hasDemandEntitlement('INVITE_ONLY', { approvedRsvp: true })).toBe(false)
    expect(hasDemandEntitlement('INVITE_ONLY', { userId: 'viewer' })).toBe(false)
    expect(hasDemandEntitlement('INVITE_ONLY', { userId: 'viewer', approvedRsvp: true })).toBe(true)
    expect(hasDemandEntitlement('INVITE_ONLY', { userId: 'viewer', validTicket: true })).toBe(true)
    expect(hasDemandEntitlement('PUBLIC', {})).toBe(true)
    expect(hasDemandEntitlement('UNLISTED', {})).toBe(true)
  })
  test('private notice content is generic for both ticket holders and opt-ins', () => {
    for (const holder of [true, false]) {
      const notice = reminderNotice('INVITE_ONLY', 'Private title', holder)
      expect(JSON.stringify(notice)).not.toContain('Private title')
      expect(notice.body).not.toContain('grab a ticket')
    }
    const wait = waitlistNotice('INVITE_ONLY', 'Private title', 'Private date')
    expect(JSON.stringify(wait)).not.toContain('Private title')
    expect(JSON.stringify(wait)).not.toContain('Private date')
  })
  test('public reminders and waitlist notices retain intended content', () => {
    expect(reminderNotice('PUBLIC', 'Festival', true).title).toBe('Coming up: Festival')
    expect(reminderNotice('UNLISTED', 'Festival', false).title).toBe('Starting soon: Festival')
    expect(waitlistNotice('PUBLIC', 'Festival', '27 Nov').body).toContain('Festival (27 Nov)')
  })
})
