import { expect, test } from 'bun:test'
import { nativePermissionStatus, secureMeetingUrl } from './meeting-device-access'

test('native permissions show correct blocked/allowed state', () => {
  expect(nativePermissionStatus(true, false)).toBe('Allowed')
  expect(nativePermissionStatus(false, false)).toContain('Blocked')
  expect(nativePermissionStatus(false, true)).toBe('Not granted')
})
test('native meeting external handoff requires secure URL and well formed ID', () => {
  expect(secureMeetingUrl('https://ieventplux.lightworldtech.com/', 'cmwnn3zis0003sibenfwhdhuw'))
    .toBe('https://ieventplux.lightworldtech.com/#/meeting/cmwnn3zis0003sibenfwhdhuw')
  expect(secureMeetingUrl('http://localhost:3000/', 'cmwnn3zis0003sibenfwhdhuw')).toBeNull()
  expect(secureMeetingUrl('https://example.com/', '../bad')).toBeNull()
  expect(secureMeetingUrl(null, 'cmwnn3zis0003sibenfwhdhuw')).toBeNull()
})
