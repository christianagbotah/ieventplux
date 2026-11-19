import { describe, expect, test } from 'bun:test'
import { availableSouvenirStock, normalizeSouvenirLines, souvenirCollectionToken, verifySouvenirCollectionToken, merchandiseChargingEnabled, merchandiseCollectionEnabled } from './souvenir-policy'

describe('Souvenir checkout and collection credentials', () => {
  const p1 = 'cm2nm3op4qr5st6uv7wx8yz9'
  const p2 = 'cm2nm3op4qr5st6uv7wx8yz0'
  test('normalizes duplicate selections and preserves stable row locks', () => {
    expect(normalizeSouvenirLines([{ productId: p1, qty: 2 }, { productId: p1, qty: 3 }, { productId: p2, qty: 1 }])).toEqual([
      { productId: p2, qty: 1 }, { productId: p1, qty: 5 },
    ].sort((a, b) => a.productId.localeCompare(b.productId)))
  })
  test('rejects fractional, zero, unsafe, excessive, and invalid rows', () => {
    for (const bad of [null, {}, [{ productId: p1, qty: 0 }], [{ productId: p1, qty: 1.2 }], [{ productId: p1, qty: 21 }], [{ productId: '../../bad', qty: 1 }], [{ productId: p1, qty: 12 }, { productId: p1, qty: 12 }]]) {
      expect(() => normalizeSouvenirLines(bad)).toThrow()
    }
  })
  test('QR token authenticates reference without personal data, but is not a pickup authorization', () => {
    const ref = 'ORD-ABCDEFGH'
    const token = souvenirCollectionToken(ref)
    expect(verifySouvenirCollectionToken(token)).toBe(ref)
    expect(token).not.toContain('customer')
    expect(verifySouvenirCollectionToken(token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a'))).toBeNull()
    expect(verifySouvenirCollectionToken('ORD-ABCDEFGH.' + '0'.repeat(32))).toBeNull()
    expect(verifySouvenirCollectionToken('ORD-ABCDEF.%2e')).toBeNull()
  })
  test('merchandise stays disabled unless all independent QA approvals are explicit', () => {
    const keys = ['IEVENTPLUX_MERCH_CHECKOUT_ENABLED', 'IEVENTPLUX_MERCH_QA_APPROVED', 'IEVENTPLUX_MERCH_COLLECTION_QA_APPROVED'] as const
    const before = keys.map((key) => process.env[key])
    try {
      for (const key of keys) delete process.env[key]
      expect(merchandiseChargingEnabled()).toBe(false)
      expect(merchandiseCollectionEnabled()).toBe(false)
      process.env.IEVENTPLUX_MERCH_CHECKOUT_ENABLED = 'true'
      expect(merchandiseChargingEnabled()).toBe(false)
      process.env.IEVENTPLUX_MERCH_QA_APPROVED = 'true'
      expect(merchandiseChargingEnabled()).toBe(true)
      expect(merchandiseCollectionEnabled()).toBe(false)
      process.env.IEVENTPLUX_MERCH_COLLECTION_QA_APPROVED = 'true'
      expect(merchandiseCollectionEnabled()).toBe(true)
    } finally {
      keys.forEach((key, i) => { if (before[i] === undefined) delete process.env[key]; else process.env[key] = before[i] })
    }
  })
  test('available quantity excludes reservations and previous sales', () => {
    expect(availableSouvenirStock(40, 15, 8)).toBe(17)
    expect(availableSouvenirStock(5, 5, 3)).toBe(0)
  })
})
