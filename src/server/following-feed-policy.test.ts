import { describe, expect, test } from 'bun:test'
import {
  followingOrgIds, followingSourceSeek, encodeFollowingCursor,
  decodeFollowingCursor, sortFollowingRows, cursorForFollowingRow,
} from './following-feed-policy'

describe('Following feed privacy', () => {
  test('only followed organizer IDs not owned by blocked/muted users', () => {
    const follows = [
      { orgId: 'org1', ownerId: 'userA' }, { orgId: 'org1', ownerId: 'userA' },
      { orgId: 'org2', ownerId: 'blocked' }, { orgId: null, ownerId: 'userA' },
      { orgId: 'org3', ownerId: 'muted' }, { orgId: 'org4', ownerId: null },
    ]
    expect(followingOrgIds(follows, new Set(['blocked', 'muted']))).toEqual(['org1'])
  })

  test('empty follows never imply featured or other organizers', () => {
    expect(followingOrgIds([], new Set())).toEqual([])
  })
})

describe('Following feed stable cross-table cursor', () => {
  const at = '2026-11-20T08:30:00.000Z'
  const earlier = '2026-11-20T07:00:00.000Z'
  const rows = [
    { kind: 'EVENT' as const, id: 'z', activityAt: at },
    { kind: 'UPDATE' as const, id: 'a', activityAt: at },
    { kind: 'EVENT' as const, id: 'a', activityAt: at },
    { kind: 'UPDATE' as const, id: 'z', activityAt: at },
    { kind: 'EVENT' as const, id: 'x', activityAt: earlier },
  ]
  test('orders by timestamp then kind/id so no duplicate feed activities', () => {
    expect(sortFollowingRows(rows).map((r) => r.kind + ':' + r.id)).toEqual([
      'UPDATE:z', 'UPDATE:a', 'EVENT:z', 'EVENT:a', 'EVENT:x',
    ])
  })

  test('encodes/decodes an opaque cursor and rejects malformed inputs', () => {
    const cursor = cursorForFollowingRow(rows[3])
    expect(decodeFollowingCursor(cursor)).toEqual({ kind: 'UPDATE', id: 'z', at })
    expect(decodeFollowingCursor(null)).toBeNull()
    for (const value of ['!!', 'x'.repeat(300), Buffer.from('{}').toString('base64url'), Buffer.from('null').toString('base64url')]) {
      expect(() => decodeFollowingCursor(value)).toThrow('Invalid feed cursor.')
    }
  })

  test('seek from UPDATE includes older EVENT rows at the same timestamp', () => {
    const cursor = { kind: 'UPDATE' as const, id: 'a', at }
    const eventSeek = followingSourceSeek('EVENT', cursor)
    const updateSeek = followingSourceSeek('UPDATE', cursor)
    expect(eventSeek).toEqual({ OR: [{ createdAt: { lt: new Date(at) } }, { createdAt: new Date(at) }] })
    expect(updateSeek).toEqual({ OR: [{ createdAt: { lt: new Date(at) } }, { createdAt: new Date(at), id: { lt: 'a' } }] })
  })

  test('seek from EVENT excludes UPDATE at equal timestamp', () => {
    const cursor = { kind: 'EVENT' as const, id: 'z', at }
    expect(followingSourceSeek('UPDATE', cursor)).toEqual({ createdAt: { lt: new Date(at) } })
    expect(followingSourceSeek('EVENT', cursor)).toEqual({ OR: [
      { createdAt: { lt: new Date(at) } }, { createdAt: new Date(at), id: { lt: 'z' } },
    ] })
  })

  test('no cursor means no time restriction', () => {
    expect(followingSourceSeek('EVENT', null)).toEqual({})
  })

  test('cursor leaves exactly the activities following the prior page', () => {
    const ordered = sortFollowingRows(rows)
    const first = ordered.slice(0, 2)
    const cursor = decodeFollowingCursor(encodeFollowingCursor({
      kind: first[1].kind, id: first[1].id, at: first[1].activityAt,
    }))!
    const after = ordered.filter((r) =>
      r.activityAt < cursor.at ||
      (r.activityAt === cursor.at && (r.kind + ':' + r.id) < (cursor.kind + ':' + cursor.id)),
    )
    expect(after.map((r) => r.kind + ':' + r.id)).toEqual(['EVENT:z', 'EVENT:a', 'EVENT:x'])
  })
})
