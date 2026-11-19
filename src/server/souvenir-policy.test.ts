import { describe, expect, test } from 'bun:test'
import { availableSouvenirStock, normalizeSouvenirLines, souvenirCollectionToken, verifySouvenirCollectionToken } from './souvenir-policy'

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
  test('signed lookup URL contains no identity and rejects tampering', () => {
    const ref='ORD-ABCDEFGH'
    const token=souvenirCollectionToken(ref)
    expect(verifySouvenirCollectionToken(token)).toBe(ref)
    expect(verifySouvenirCollectionToken(token.slice(0,-1)+'0')).toBeNull()
    expect(verifySouvenirCollectionToken('ORD-ZZZZZZZZ.'+'0'.repeat(32))).toBeNull()
  })
  test('sold and reserved units are unavailable to new buyers', () => {
    expect(availableSouvenirStock(30,8,7)).toBe(15)
    expect(availableSouvenirStock(9,9,2)).toBe(0)
  })
})
