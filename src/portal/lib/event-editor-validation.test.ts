import { describe, expect, test } from 'bun:test'
import { eventDraftIsReady, validateEventDraftTiming } from './event-editor-validation'

describe('organizer event editor date and title validation', () => {
  const valid = { title: 'Global music conference', startsAt: '2026-12-14T08:00', endsAt: '2026-12-14T18:00' }

  test('valid draft with clear title and future end time', () => {
    expect(eventDraftIsReady(valid)).toBe(true)
    expect(validateEventDraftTiming(valid)).toEqual({})
  })
  test('title requires at least three non-space characters', () => {
    expect(validateEventDraftTiming({ ...valid, title: '  a ' }).title).toContain('at least 3')
    expect(eventDraftIsReady({ ...valid, title: '  ' })).toBe(false)
  })
  test('invalid dates are rejected before calling toISOString or submitting', () => {
    expect(validateEventDraftTiming({ ...valid, startsAt: '' }).startsAt).toContain('start')
    expect(validateEventDraftTiming({ ...valid, endsAt: 'not-a-date' }).endsAt).toContain('end')
    expect(validateEventDraftTiming({ ...valid, startsAt: '2026-12-14' }).startsAt).toBeDefined()
    expect(validateEventDraftTiming({ ...valid, startsAt: '2026-02-30T12:00' }).startsAt).toBeDefined()
    expect(validateEventDraftTiming({ ...valid, endsAt: '2026-12-14T25:00' }).endsAt).toBeDefined()
  })
  test('end must be after start, including same-day and overnight events', () => {
    expect(validateEventDraftTiming({ ...valid, endsAt: valid.startsAt }).endsAt).toContain('later')
    expect(validateEventDraftTiming({ ...valid, endsAt: '2026-12-14T07:59' }).endsAt).toContain('later')
    expect(eventDraftIsReady({ ...valid, endsAt: '2026-12-15T01:00' })).toBe(true)
  })
  test('existing event dates in the past remain editable when chronologically correct', () => {
    expect(eventDraftIsReady({ ...valid, startsAt: '2025-01-01T18:00', endsAt: '2025-01-01T19:00' })).toBe(true)
  })
})
