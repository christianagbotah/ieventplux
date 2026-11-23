import { expect, test } from 'bun:test'
import { mayEnterNativeRoom, validNativeMeetingCredentials } from './native-meeting-policy'

test('only signed WebSocket addresses and nonempty tokens are accepted', () => {
  const token = 'synthetic-token-for-testing-only-not-real'
  expect(validNativeMeetingCredentials({ token, serverUrl: 'wss://meetings.example.test/' })).toBe(true)
  for (const serverUrl of [
    'ws://meetings.example.test', 'https://meetings.example.test',
    'wss://evil@meetings.example.test', 'wss://meetings.example.test/?token=sensitive',
    'wss://meetings.example.test/unsafe',
  ]) expect(validNativeMeetingCredentials({ token, serverUrl })).toBe(false)
  expect(validNativeMeetingCredentials({ token: 'short', serverUrl: 'wss://meetings.example.test/' })).toBe(false)
})
test('native room only opens in custom runtime for an active SFU session', () => {
  expect(mayEnterNativeRoom({ meetingStatus: 'LIVE', engine: 'sfu', nativeCapable: true })).toBe(true)
  expect(mayEnterNativeRoom({ meetingStatus: 'LIVE', engine: 'sfu', nativeCapable: false })).toBe(false)
  expect(mayEnterNativeRoom({ meetingStatus: 'ENDED', engine: 'sfu', nativeCapable: true })).toBe(false)
  expect(mayEnterNativeRoom({ meetingStatus: 'LIVE', engine: 'mesh', nativeCapable: true })).toBe(false)
})
