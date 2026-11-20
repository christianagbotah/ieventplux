import { describe, expect, test } from 'bun:test'
import { parseSouvenirScan } from './souvenir-scan'

const origin = 'https://ieventplux.lightworldtech.com'
const token = 'ORD-ABCDEFGH.' + 'a'.repeat(32)

describe('souvenir scanner accepts only internal collection credentials', () => {
  test('accepts raw QR token and exact-origin collection URL', () => {
    expect(parseSouvenirScan(token, origin)).toEqual({ type: 'token', token })
    expect(parseSouvenirScan(`${origin}/#/collect/${token}`, origin)).toEqual({ type: 'token', token })
    expect(parseSouvenirScan(`/#/collect/${token}`, origin)).toEqual({ type: 'token', token })
  })
  test('recognizes printed receipt references for staff-authorized lookup', () => {
    expect(parseSouvenirScan('  ord-abcdefgh  ', origin)).toEqual({ type: 'reference', reference: 'ORD-ABCDEFGH' })
    expect(parseSouvenirScan('RCPT-ORD-ABCDEFGH', origin)).toEqual({ type: 'reference', reference: 'ORD-ABCDEFGH' })
  })
  test('rejects ticket QRs, arbitrary links, dangerous URLs and invalid credentials', () => {
    for (const bad of [
      'https://attacker.example/#/collect/' + token,
      'javascript:alert(1)',
      `${origin}/#/admin`,
      `${origin}/#//collect/${token}`,
      `${origin}/#/collect/${token}?x=1`,
      `${origin}/#/collect/${token}x`,
      `${origin}/?redirect=1#/collect/${token}`,
      `${origin}.attacker.example/#/collect/${token}`,
      'IEVX1.ABCDEF.unsafe',
      token.slice(0, -1),
      'ORD-../../broken',
      'a'.repeat(901),
    ]) expect(parseSouvenirScan(bad, origin)).toBeNull()
  })
})
