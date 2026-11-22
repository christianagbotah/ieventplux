import { describe, expect, test } from 'bun:test'
import { sameSouvenirCollectionAction } from './souvenir-collection'

describe('physical collection idempotency identity', () => {
  const original = { collectorId: 'staff-a', orderItemId: 'line-a', eventId: 'event-a', qty: 2 }
  test('accepts exact retry of the same staff action', () => {
    expect(sameSouvenirCollectionAction(original, { ...original })).toBe(true)
  })
  test('rejects replay by a different staff member even for the same receipt', () => {
    expect(sameSouvenirCollectionAction(original, { ...original, collectorId: 'staff-b' })).toBe(false)
  })
  test('rejects reuse across event, line, or quantity', () => {
    for (const change of [{ eventId: 'event-b' }, { orderItemId: 'line-b' }, { qty: 1 }]) {
      expect(sameSouvenirCollectionAction(original, { ...original, ...change })).toBe(false)
    }
  })
})
