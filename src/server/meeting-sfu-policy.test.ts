import { describe, expect, test } from 'bun:test'
import { meetingMediaEngine, meetingSfuConfigured, validMediaCapacity, meetingCapacityLabel } from './meeting-sfu-policy'

const complete = {
  IEVENTPLUX_MEETING_MEDIA_ENGINE: 'sfu',
  MEETING_SFU_PUBLIC_WS_URL: 'wss://ieventplux.example.com/livekit',
  MEETING_SFU_INTERNAL_HTTP_URL: 'http://127.0.0.1:7880',
  MEETING_SFU_API_KEY: 'exampleapikey',
  MEETING_SFU_API_SECRET: 'this-is-not-real-just-a-unit-test-secret-123',
}
describe('Scalable event meeting media policy', () => {
  test('large rooms require explicit, complete SFU configuration', () => {
    expect(meetingMediaEngine({})).toBe('mesh')
    expect(meetingMediaEngine({ IEVENTPLUX_MEETING_MEDIA_ENGINE: 'sfu' })).toBe('unavailable')
    expect(meetingMediaEngine(complete)).toBe('sfu')
    expect(meetingSfuConfigured({ ...complete, MEETING_SFU_PUBLIC_WS_URL: 'ws://localhost:7880' })).toBe(false)
    expect(meetingSfuConfigured({ ...complete, MEETING_SFU_API_SECRET: '123' })).toBe(false)
    expect(meetingSfuConfigured({ ...complete, MEETING_SFU_PUBLIC_WS_URL: 'wss://evil.test/@phish' })).toBe(false)
  })
  test('no fixed application maximum only when SFU is configured', () => {
    for (const size of [0, 2, 7, 150, 1_000, 30_000]) expect(validMediaCapacity(size, 'sfu')).toBe(size)
    expect(validMediaCapacity(0, 'mesh')).toBeNull()
    expect(validMediaCapacity(7, 'mesh')).toBeNull()
    expect(validMediaCapacity(6, 'mesh')).toBe(6)
    expect(validMediaCapacity(30_000, 'unavailable')).toBeNull()
    for (const value of [-1, 2.5, Number.NaN, 'bad', 1_000_001]) expect(validMediaCapacity(value, 'sfu')).toBeNull()
    expect(meetingCapacityLabel(0, 'sfu')).toBe('No fixed limit')
    expect(meetingCapacityLabel(6, 'mesh')).toBe('6')
  })
})
