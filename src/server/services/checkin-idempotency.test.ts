import { describe, expect, test } from 'bun:test'
import { isSameScanContext, isSameScanCredential, validClientScanId, validCaptureTime } from './checkin-idempotency'

const before = { eventId: 'e1', scannerId: 'staff-1', ticketId: 'ticket-1' }
const ticket = { id: 'ticket-1', code: 'TKT-123' }
describe('Check-in anti-replay and access policy', () => {
  test('same scan ID from another event or staff cannot disclose the original ticket', () => {
    expect(isSameScanContext(before, { eventId: 'e1', scannerId: 'staff-1' })).toBe(true)
    expect(isSameScanContext(before, { eventId: 'e2', scannerId: 'staff-1' })).toBe(false)
    expect(isSameScanContext(before, { eventId: 'e1', scannerId: 'staff-2' })).toBe(false)
  })
  test('same request may safely return the original result only for the same credential', () => {
    expect(isSameScanCredential(' tkt-123 ', ticket, () => false)).toBe(true)
    expect(isSameScanCredential('TKT-DIFFERENT', ticket, () => true)).toBe(false)
    expect(isSameScanCredential('IEVX1.ticket-1.aaaaaaaaaaaaaaaaaaaaaaaa', ticket, () => true)).toBe(true)
    expect(isSameScanCredential('IEVX1.ticket-1.aaaaaaaaaaaaaaaaaaaaaaaa', ticket, () => false)).toBe(false)
    expect(isSameScanCredential('IEVX1.ticket-2.aaaaaaaaaaaaaaaaaaaaaaaa', ticket, () => true)).toBe(false)
    expect(isSameScanCredential('IEVX1.ticket-1.invalid', ticket, () => true)).toBe(false)
  })
  test('stable random client identifiers are bounded and safe', () => {
    expect(validClientScanId('web-c6af4a4d-e8c0-4eca-85af-62a407dbcd22')).toBe(true)
    expect(validClientScanId('')).toBe(false)
    expect(validClientScanId('../another')).toBe(false)
    expect(validClientScanId('a'.repeat(129))).toBe(false)
  })
  test('malformed or future offline times cannot crash database writes', () => {
    expect(validCaptureTime(undefined)).toBe(true)
    expect(validCaptureTime('2026-11-20T08:00:00.000Z')).toBe(true)
    expect(validCaptureTime('not-a-time')).toBe(false)
    expect(validCaptureTime(new Date(Date.now() + 3600000).toISOString())).toBe(false)
  })
})
