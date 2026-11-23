import { describe, expect, test } from 'bun:test'
import { availableSouvenirStock, compareInventoryIds, normalizeSouvenirSelections, souvenirLinePrice } from './souvenir-checkout-policy'

const blackM = 'cm2nm3op4qr5st6uv7wx8yz9'
const blueL = 'cm2nm3op4qr5st6uv7wx8yz0'

describe('Souvenir checkout policy (no payments or stock writes)', () => {
  test('inventory lock ordering is deterministic for both ticket and souvenir keys', () => {
    const ids = ['cz9', 'ca1', 'cA1', 'ca0', 'ca1']
    expect([...ids].sort(compareInventoryIds)).toEqual(['cA1', 'ca0', 'ca1', 'ca1', 'cz9'])
    expect(compareInventoryIds('same', 'same')).toBe(0)
  })

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
  test('rejects accessor-backed checkout fields without invoking getters', () => {
    let reads = 0
    const accessorId = { get productId() { reads++; return blackM }, qty: 1 }
    const accessorQty = { productId: blackM, get qty() { reads++; return 1 } }
    for (const item of [accessorId, accessorQty]) expect(() => normalizeSouvenirSelections([item])).toThrow()
    expect(reads).toBe(0)
  })
  test('rejects newline-suffixed opaque product identifiers (regex dollar-anchor bypass)', () => {
    for (const productId of [blackM + '\n', blackM + '\r\n', blackM + ' ', ' ' + blackM]) {
      expect(() => normalizeSouvenirSelections([{ productId, qty: 1 }])).toThrow()
    }
  })
  test('requires canonical lowercase ASCII product IDs for stable stock-lock identity', () => {
    expect(normalizeSouvenirSelections([{ productId: blackM, qty: 1 }])).toEqual([{ productId: blackM, qty: 1 }])
    for (const productId of [blackM.toUpperCase(), blackM.slice(0, -1) + 'K', blackM.slice(0, -1) + 'K', blackM.slice(0, -1) + 'ſ']) {
      expect(() => normalizeSouvenirSelections([{ productId, qty: 1 }])).toThrow()
    }
  })
  test('rejects oversized row batches and non-finite numeric inputs before inventory access', () => {
    expect(() => normalizeSouvenirSelections(Array.from({ length: 31 }, () => ({ productId: blackM, qty: 1 })))).toThrow()
    for (const qty of [NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 0.5, '1', null]) {
      expect(() => normalizeSouvenirSelections([{ productId: blackM, qty }])).toThrow()
    }
    expect(normalizeSouvenirSelections([])).toEqual([])
    expect(normalizeSouvenirSelections(Array.from({ length: 20 }, () => ({ productId: blackM, qty: 1 })))).toEqual([{ productId: blackM, qty: 20 }])
  })
  test('permuted concurrent carts normalize to identical stock-lock order and quantities', () => {
    const variants = [blackM, blueL, 'ca123456789012', 'cz123456789012']
    const cart = variants.flatMap((productId) => [
      { productId, qty: 1 }, { productId, qty: 2 }, { productId, qty: 3 },
    ])
    const expected = normalizeSouvenirSelections(cart)
    expect(expected).toHaveLength(variants.length)
    for (let seed = 1; seed <= 128; seed++) {
      const shuffled = [...cart]
      // Deterministic Fisher-Yates permutations, without locale-dependent ordering.
      let state = seed
      for (let i = shuffled.length - 1; i > 0; i--) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        const j = state % (i + 1)
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      expect(normalizeSouvenirSelections(shuffled)).toEqual(expected)
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
