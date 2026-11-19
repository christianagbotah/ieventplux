import { describe, expect, test } from 'bun:test'
import { contributorPayload, souvenirPayload, CONTRIBUTOR_ROLES } from './event-programme-policy'

describe('event programme and souvenir policies', () => {
  test('stores concrete speaker identities, topics and optional sessions', () => {
    const item = contributorPayload({ name: ' Guest Speaker ', role: 'MAIN_SPEAKER', topic: 'Leadership and service', startsAt: '2026-11-26T12:00:00Z', endsAt: '2026-11-26T13:00:00Z' })
    expect(item.name).toBe('Guest Speaker')
    expect(item.role).toBe('MAIN_SPEAKER')
    expect(item.topic).toBe('Leadership and service')
    expect(CONTRIBUTOR_ROLES).toContain('ARTIST')
  })
  test('rejects invented roles and backwards schedules', () => {
    expect(() => contributorPayload({ name: 'John', role: 'ADMIN' })).toThrow()
    expect(() => contributorPayload({ name: 'John', startsAt: '2026-11-28', endsAt: '2026-11-27' })).toThrow()
    expect(() => contributorPayload({ name: 'John', photoUrl: 'javascript:alert(1)' })).toThrow()
  })
  test('uses integer money and SKU uniqueness-friendly naming', () => {
    const p = souvenirPayload({ name: 'Official T-shirt', sku: 'ts-xl-black', priceMinor: 4500, stockTotal: 90, variantLabel: 'XL · Black' })
    expect(p.priceMinor).toBe(4500)
    expect(p.sku).toBe('TS-XL-BLACK')
    expect(p.stockTotal).toBe(90)
  })
  test('does not allow impossible stock edits or repricing sold stock', () => {
    const previous = { priceMinor: 5500, stockTotal: 40, stockSold: 15, stockReserved: 3 }
    expect(() => souvenirPayload({ name: 'Shirt', sku: 'TS-M', priceMinor: 5000, stockTotal: 40 }, previous)).toThrow()
    expect(() => souvenirPayload({ name: 'Shirt', sku: 'TS-M', priceMinor: 5500, stockTotal: 17 }, previous)).toThrow()
    expect(souvenirPayload({ name: 'Shirt', sku: 'TS-M', priceMinor: 5500, stockTotal: 18 }, previous).stockTotal).toBe(18)
  })
  test('rejects fractional prices, invalid SKU and unsafe links', () => {
    expect(() => souvenirPayload({ name: 'Shirt', sku: 'A', priceMinor: 5000, stockTotal: 3 })).toThrow()
    expect(() => souvenirPayload({ name: 'Shirt', sku: 'TS-M', priceMinor: 5000.5, stockTotal: 3 })).toThrow()
    expect(() => souvenirPayload({ name: 'Shirt', sku: 'TS-M', priceMinor: 5000, stockTotal: 3, imageUrl: 'data:text/html,evil' })).toThrow()
  })
})
