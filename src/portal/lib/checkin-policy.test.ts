import { describe, expect, test } from 'bun:test'
import { ApiClientError } from '../api'
import { scanMayQueueOffline } from './checkin-policy'

describe('web check-in offline safety', () => {
  test('network transport failure is eligible for provisional queue', () => {
    expect(scanMayQueueOffline(new TypeError('Failed to fetch'), true)).toBe(true)
    expect(scanMayQueueOffline(new TypeError('Network error'), false)).toBe(true)
    expect(scanMayQueueOffline(new Error('Browser offline'), false)).toBe(true)
    expect(scanMayQueueOffline(new ApiClientError('NETWORK_ERROR', 'Connection lost', 0), true)).toBe(true)
    expect(scanMayQueueOffline(new ApiClientError('NETWORK_ERROR', 'Connection lost', 0), false)).toBe(true)
    expect(scanMayQueueOffline(new ApiClientError('REQUEST_CANCELLED', 'Aborted', 0), false)).toBe(false)
  })
  test('server-side rejections must never be queued, even while offline', () => {
    for (const status of [400, 401, 403, 409, 429, 500, 503]) {
      const failure = new ApiClientError('CHECKIN_REJECTED', 'Server declined', status)
      expect(scanMayQueueOffline(failure, true)).toBe(false)
      expect(scanMayQueueOffline(failure, false)).toBe(false)
    }
  })
  test('unexpected application errors are not inferred to be network outages', () => {
    expect(scanMayQueueOffline(new Error('Bad ticket shape'), true)).toBe(false)
  })
})
