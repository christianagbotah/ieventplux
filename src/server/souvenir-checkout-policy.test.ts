import { describe, expect, test } from 'bun:test'
import { availableSouvenirStock, normalizeSouvenirSelections, souvenirLinePrice } from './souvenir-checkout-policy'

const blackM = 'cm2nm3op4qr5st6uv7wx8yz9'
const blueL = 'cm2nm3op4qr5st6uv7wx8yz0'

describe('Souvenir checkout policy (no payments or stock writes)', () => {
  test('same variant is combined, separate variants remain distinct, stable lock order', () => {
    expect(normalizeSouvenirSelections([{ productId: blackM, qty: 2 }, { productId: blueL, qty: 1 }, { productId: blackM, qty: 3 }])).toEqual([
      { productId: blueL, qty: 1 }, { productId: blackM, qty: 5 },
    ])
  })
  test('rejects malformed, fractional, zero, negative and excess quantities', () => {
    for (const value of [null, {}, [{ productId: blackM, qty: 0 }], [{ productId: blackM, qty: -1 }], [{ productId: blackM, qty: 1.5 }], [{ productId: blackM, qty: 21 }], [{ productId: blackM, qty: 12 }, { productId: blackM, qty: 12 }], [{ productId: '../other-event', qty: 1 }]]) {
      expect(() => normalizeSouvenirSelections(value)).toThrow()
    }
  })
  test('rejects inherited fields and array-shaped selections', () => {
    const inherited = Object.create({ productId: blackM, qty: 1 })
    for (const item of [inherited, Object.assign(Object.create({ qty: 1 }), { productId: blackM }), Object.assign(Object.create({ productId: blackM }), { qty: 1 }), [blackM, 1]]) {
      expect(() => normalizeSouvenirSelections([item])).toThrow()
    }
  })
  test('rejects newline-suffixed opaque product identifiers (regex dollar-anchor bypass)', () => {
    for (const productId of [blackM + '\n', blackM + '\r\n', blackM + ' ', ' ' + blackM]) {
      expect(() => normalizeSouvenirSelections([{ productId, qty: 1 }])).toThrow()
    }
  })
  test('enforces integer pesewa pricing and maximum line value', () => {
    expect(souvenirLinePrice(5000, 3)).toBe(15000)
    for (const price of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) expect(() => souvenirLinePrice(price, 2)).toThrow()
    expect(() => souvenirLinePrice(1_500_000_000, 2)).toThrow()
  })
  test('available stock excludes sold and reserved units', () => {
    expect(availableSouvenirStock(20, 5, 8)).toBe(7)
    expect(availableSouvenirStock(5, 5, 0)).toBe(0)
    expect(() => availableSouvenirStock(5, 5, 2)).toThrow()
    expect(() => availableSouvenirStock(5, 6, 0)).toThrow()
    expect(() => availableSouvenirStock(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1)).toThrow()
    expect(() => availableSouvenirStock(10, -1, 0)).toThrow()
  })
})
