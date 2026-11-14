/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test'
import { canJoinRoom, parseRoomKey } from './room-authorization'

describe('private realtime room authorization', () => {
  test('rejects malformed and attacker-chosen room names', () => {
    for (const value of ['', 'user:12', 'admins:someone', 'user:abc/defgh', 12, 'user:' + 'x'.repeat(100)]) {
      expect(parseRoomKey(value)).toBeNull()
    }
  })
  test('user notification rooms belong only to matching signed-in account', () => {
    const room = parseRoomKey('user:abcdefghijk')!
    expect(canJoinRoom(room, 'abcdefghijk')).toBe(true)
    expect(canJoinRoom(room, null)).toBe(false)
    expect(canJoinRoom(room, 'otheruser123')).toBe(false)
  })
  test('broadcast rooms reject anonymous and users without a pass', () => {
    const room = parseRoomKey('broadcast:broadcast123')!
    expect(canJoinRoom(room, null, {activePlayback:true})).toBe(false)
    expect(canJoinRoom(room, 'viewer123')).toBe(false)
    expect(canJoinRoom(room, 'viewer123', {activePlayback:true})).toBe(true)
    expect(canJoinRoom(room, 'organizer123', {orgMember:true})).toBe(true)
  })
  test('public event room supports visitors, invite-only room requires proof', () => {
    const room = parseRoomKey('event:event000123')!
    expect(canJoinRoom(room, null, {publicEvent:true})).toBe(true)
    expect(canJoinRoom(room, null, {publicEvent:false})).toBe(false)
    expect(canJoinRoom(room, 'attendee123', {approvedRsvp:true})).toBe(true)
    expect(canJoinRoom(room, 'attendee123', {validTicket:true})).toBe(true)
    expect(canJoinRoom(room, 'organizer123', {orgMember:true})).toBe(true)
  })
})
