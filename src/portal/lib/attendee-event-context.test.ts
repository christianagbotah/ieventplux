import { describe, expect, test } from 'bun:test'
import { attendeeEventRoute, selectAttendeeEvent, validScopedEventId } from './attendee-event-context'
const one = { id: 'event_1', title: 'First event' }
const two = { id: 'event_2', title: 'Second event' }
const third = { id: 'event_3', title: 'Older event' }

describe('Organizer attendee deep-links', () => {
  test('selects requested authorized event instead of first in list', () => {
    expect(selectAttendeeEvent([one, two], 'event_2').selectedId).toBe('event_2')
  })
  test('brings individually scoped older event into selector', () => {
    expect(selectAttendeeEvent([one, two], 'event_3', third)).toEqual({ events: [third, one, two], selectedId: 'event_3' })
  })
  test('rejects unrelated returned event and falls back to authorized list', () => {
    expect(selectAttendeeEvent([one], 'event_3', two)).toEqual({ events: [one], selectedId: 'event_1' })
  })
  test('no event cannot accidentally select a foreign event', () => {
    expect(selectAttendeeEvent([], 'unknown', null)).toEqual({ events: [], selectedId: '' })
  })
  test('validates scoped lookup IDs and deep-links', () => {
    expect(validScopedEventId('cmm-a_1')).toBe(true)
    expect(validScopedEventId('../secret')).toBe(false)
    expect(validScopedEventId('a'.repeat(129))).toBe(false)
    expect(attendeeEventRoute('cmm-a_1')).toBe('/organizer?tab=attendees&eventId=cmm-a_1')
  })
})
