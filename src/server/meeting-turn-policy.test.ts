import { describe, expect, test } from 'bun:test'
import { configuredMeetingTurnUrls, meetingRuntimeEnabled, meetingTurnConfigured } from './meeting-turn-policy'

const strong = 'a'.repeat(48)
const valid = {
  MEETING_TURN_URLS: 'turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp',
  MEETING_TURN_SHARED_SECRET: strong,
}
describe('Group meeting TURN infrastructure gate', () => {
  test('requires deliberate opt-in; in production requires usable TURN credentials', () => {
    expect(meetingRuntimeEnabled({ ...valid, NODE_ENV: 'production' })).toBe(false)
    expect(meetingRuntimeEnabled({ ...valid, NODE_ENV: 'production', IEVENTPLUX_GROUP_MEETINGS_ENABLED: 'true' })).toBe(true)
    expect(meetingRuntimeEnabled({ NODE_ENV: 'production', IEVENTPLUX_GROUP_MEETINGS_ENABLED: 'true' })).toBe(false)
    expect(meetingRuntimeEnabled({ NODE_ENV: 'test', IEVENTPLUX_GROUP_MEETINGS_ENABLED: 'true' })).toBe(true)
    expect(meetingRuntimeEnabled({ ...valid, IEVENTPLUX_GROUP_MEETINGS_ENABLED: 'TRUE' })).toBe(false)
  })
  test('rejects weak relay credentials or invalid and local URLs', () => {
    expect(meetingTurnConfigured(valid)).toBe(true)
    expect(configuredMeetingTurnUrls(valid)).toHaveLength(2)
    expect(meetingTurnConfigured({ ...valid, MEETING_TURN_SHARED_SECRET: 'secret' })).toBe(false)
    expect(meetingTurnConfigured({ ...valid, MEETING_TURN_URLS: '' })).toBe(false)
    for (const url of ['https://turn.example.com', 'turn:localhost:3478', 'turn:127.0.0.1:3478',
      'turn:admin@turn.example.com:3478', 'turn:host/path', 'turn:host?transport=spoofed']) {
      expect(meetingTurnConfigured({ ...valid, MEETING_TURN_URLS: url })).toBe(false)
    }
  })
})
