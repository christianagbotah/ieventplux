import { describe, expect, test } from 'bun:test'
import { availableSouvenirStock, normalizeSouvenirLines, souvenirCollectionToken, verifySouvenirCollectionToken, souvenirCollectionEnabled } from './souvenir-policy'

describe('souvenir inventory and collection policy', () => {
  const a = 'cm2nm3op4qr5st6uv7wx8yz9'
  const b = 'cm2nm3op4qr5st6uv7wx8yz0'
  test('coalesces duplicate product quantities with a stable lock order', () => {
    const rows = normalizeSouvenirLines([{productId:a,qty:2},{productId:a,qty:3},{productId:b,qty:1}])
    expect(rows).toEqual([{productId:b,qty:1},{productId:a,qty:5}].sort((x,y)=>x.productId.localeCompare(y.productId)))
  })
  test('rejects empty, fractional, oversized, unsafe selections', () => {
    for (const rows of [null,{},[{productId:a,qty:0}],[{productId:a,qty:1.5}],[{productId:a,qty:21}],[{productId:'../../secret',qty:1}],[{productId:a,qty:11},{productId:a,qty:11}]]) expect(()=>normalizeSouvenirLines(rows)).toThrow()
  })
  test('rejects padded opaque IDs and matches the canonical checkout policy', () => {
    expect(() => normalizeSouvenirLines([{ productId: ' ' + a, qty: 1 }])).toThrow()
    expect(() => normalizeSouvenirLines([{ productId: a + ' ', qty: 1 }])).toThrow()
  })
  test('signed lookup URL contains no identity and rejects tampering', () => {
    const ref='ORD-ABCDEFGH'
    const token=souvenirCollectionToken(ref)
    expect(verifySouvenirCollectionToken(token)).toBe(ref)
    expect(verifySouvenirCollectionToken(token.slice(0,-1)+'0')).toBeNull()
    expect(verifySouvenirCollectionToken('ORD-ZZZZZZZZ.'+'0'.repeat(32))).toBeNull()
  })
  test('collection stays disabled unless checkout and collection are both explicitly approved', () => {
    const checkout = process.env.IEVENTPLUX_SOUVENIR_CHECKOUT_ENABLED
    const collection = process.env.IEVENTPLUX_SOUVENIR_COLLECTION_ENABLED
    try {
      for (const [a,b,allowed] of [['0','0',false],['1','0',false],['0','1',false],['1','1',true]] as const) {
        process.env.IEVENTPLUX_SOUVENIR_CHECKOUT_ENABLED = a
        process.env.IEVENTPLUX_SOUVENIR_COLLECTION_ENABLED = b
        expect(souvenirCollectionEnabled()).toBe(allowed)
      }
    } finally {
      if (checkout === undefined) delete process.env.IEVENTPLUX_SOUVENIR_CHECKOUT_ENABLED
      else process.env.IEVENTPLUX_SOUVENIR_CHECKOUT_ENABLED = checkout
      if (collection === undefined) delete process.env.IEVENTPLUX_SOUVENIR_COLLECTION_ENABLED
      else process.env.IEVENTPLUX_SOUVENIR_COLLECTION_ENABLED = collection
    }
  })
  test('sold and reserved units are unavailable to new buyers', () => {
    expect(availableSouvenirStock(30,8,7)).toBe(15)
    expect(availableSouvenirStock(9,9,0)).toBe(0)
    for (const counters of [[9,9,2], [9,10,0], [9,-1,0], [9,0,NaN], [9,0,1.5]] as const) {
      expect(() => availableSouvenirStock(counters[0], counters[1], counters[2])).toThrow()
    }
  })
})
