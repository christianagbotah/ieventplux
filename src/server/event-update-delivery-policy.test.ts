import { describe, expect, test } from 'bun:test'
import { eventUpdateAudience, eventUpdateNotice } from './event-update-delivery-policy'

describe('event update delivery policy', () => {
  const rows = {
    authorId: 'host',
    holders: [{ userId: 'ticket' }, { userId: 'host' }, { userId: null }],
    buyers: [{ userId: 'old-buyer' }],
    followers: [{ followerId: 'follower' }, { followerId: 'ticket' }],
    approvals: [{ userId: 'approved' }, { userId: 'ticket' }, { userId: null }],
  }
  test('private delivery includes approved RSVP and ticket holders only', () => {
    expect([...eventUpdateAudience({ ...rows, privateEvent: true })]).toEqual(['ticket', 'approved'])
  })
  test('public delivery preserves follower and buyer reach, excludes author and duplicates', () => {
    expect([...eventUpdateAudience({ ...rows, privateEvent: false })]).toEqual(['ticket', 'old-buyer', 'follower'])
  })
  test('private notices never include event content in title, body or SMS', () => {
    const notice = eventUpdateNotice(true, true, 'Restricted venue', 'Private directions')
    expect(JSON.stringify(notice)).not.toContain('Restricted venue')
    expect(JSON.stringify(notice)).not.toContain('Private directions')
    expect(notice.title).toBe('Important private event update')
    expect(eventUpdateNotice(true, false, 'Secret', 'Secret').title).toBe('Private event update')
  })
  test('public notices preserve content with bounded body and SMS preview', () => {
    const body = 'x'.repeat(250)
    const notice = eventUpdateNotice(false, true, 'Schedule', body)
    expect(notice.title).toBe('Important update — Schedule')
    expect(notice.body).toHaveLength(200)
    expect(notice.sms).toBe('iEventPlux — Schedule: ' + 'x'.repeat(120) + '…')
  })
})
