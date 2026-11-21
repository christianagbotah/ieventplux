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
  test('never accepts insecure HTTP collection links, even from a configured HTTP origin', () => {
    expect(parseSouvenirScan(`http://ieventplux.lightworldtech.com/#/collect/${token}`, origin)).toBeNull()
    expect(parseSouvenirScan(`http://ieventplux.lightworldtech.com/#/collect/${token}`, 'http://ieventplux.lightworldtech.com')).toBeNull()
    expect(parseSouvenirScan(`/#/collect/${token}`, 'http://ieventplux.lightworldtech.com')).toBeNull()
  })
  test('rejects embedded and surrounding control characters in scanned credentials', () => {
    for (const bad of [token + '\n', '\t' + token, token + '\r', token.slice(0, 8) + '\u0000' + token.slice(8), origin + '/#/collect/' + token + '\n']) {
      expect(parseSouvenirScan(bad, origin)).toBeNull()
    }
  })
  test('rejects invisible Unicode and bidirectional control characters in QR input', () => {
    for (const hidden of ['\u200b', '\u200e', '\u200f', '\u202e', '\u2060', '\u2066', '\u2069', '\ufeff']) {
      expect(parseSouvenirScan(token + hidden, origin)).toBeNull()
      expect(parseSouvenirScan(`${origin}/#/collect/${token}${hidden}`, origin)).toBeNull()
      expect(parseSouvenirScan(`ORD-ABC${hidden}DEFGH`, origin)).toBeNull()
    }
  })
  test('rejects origin confusion, userinfo, ports, paths and query-bearing collection links', () => {
    for (const bad of [
      `https://ieventplux.lightworldtech.com@attacker.example/#/collect/${token}`,
      `https://attacker.example@ieventplux.lightworldtech.com/#/collect/${token}`,
      `https://ieventplux.lightworldtech.com:444/#/collect/${token}`,
      `https://ieventplux.lightworldtech.com/collect/#/collect/${token}`,
      `https://ieventplux.lightworldtech.com/%2f#/collect/${token}`,
      `https://ieventplux.lightworldtech.com/?x=1#/collect/${token}`,
      `//attacker.example/#/collect/${token}`,
      `https:\\ieventplux.lightworldtech.com/#/collect/${token}`,
      `https:/ieventplux.lightworldtech.com/#/collect/${token}`,
      `\\ieventplux.lightworldtech.com/#/collect/${token}`,
      `#\/collect/${token}`,
      `collect/${token}`,
      `//ieventplux.lightworldtech.com/#/collect/${token}`,
      `HTTPS://ieventplux.lightworldtech.com/#/collect/${token}`,
      `https://ieventplux.lightworldtech.com/#/collect/${token}#extra`,
    ]) expect(parseSouvenirScan(bad, origin)).toBeNull()
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
