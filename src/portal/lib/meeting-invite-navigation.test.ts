import { describe, expect, test } from 'bun:test'
import { meetingAuthRoute, meetingSignInRoute, safeMeetingReturnPath } from './meeting-invite-navigation'

const valid = '/meeting/cmj28m6xu0001eventtestroom'

describe('Meeting invite authentication and return links', () => {
  test('returns users to the same meeting after signing in', () => {
    expect(safeMeetingReturnPath(valid)).toBe(valid)
    expect(meetingAuthRoute('signin', valid)).toBe('/signin?next=' + encodeURIComponent(valid))
    expect(meetingAuthRoute('register', valid)).toBe('/register?next=' + encodeURIComponent(valid))
    expect(meetingSignInRoute('cmj28m6xu0001eventtestroom')).toBe('/signin?next=' + encodeURIComponent(valid))
  })
  test('refuses external and malformed redirect targets', () => {
    for (const unsafe of [
      'https://attacker.example', '//attacker.example', '/\\attacker.example',
      '/meeting/../admin', '/meeting/test/../../admin', '/meeting/x?next=/admin',
      '/meeting/x#other', '/admin', '/', '/event/something', '/meeting/%2Fadmin',
      '/meeting/a', '/meeting/' + 'a'.repeat(180), '\n/meeting/validroomname',
    ]) {
      expect(safeMeetingReturnPath(unsafe)).toBeNull()
      expect(meetingAuthRoute('signin', unsafe)).toBe('/signin')
    }
  })
  test('missing return link preserves ordinary sign-in and registration flows', () => {
    expect(safeMeetingReturnPath(null)).toBeNull()
    expect(meetingAuthRoute('signin', null)).toBe('/signin')
    expect(meetingAuthRoute('register', undefined)).toBe('/register')
    expect(meetingSignInRoute('../invalid')).toBe('/signin')
  })
})
