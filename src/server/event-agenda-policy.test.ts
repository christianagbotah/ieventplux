import { describe, expect, test } from 'bun:test'
import { agendaItemPayload } from './event-agenda-policy'

const base = {
  title: 'Keynote address',
  startsAt: '2026-12-06T09:00:00.000Z',
  endsAt: '2026-12-06T10:00:00.000Z',
  speaker: 'Guest speaker', description: 'Official topic', sortOrder: 2,
}
describe('authoritative agenda slot policy', () => {
  test('accepts a valid slot, preserving exact event instants', () => {
    const item=agendaItemPayload(base)
    expect(item.title).toBe(base.title)
    expect(item.startsAt.toISOString()).toBe(base.startsAt)
    expect(item.endsAt?.toISOString()).toBe(base.endsAt)
    expect(item.sortOrder).toBe(2)
  })
  test('permits an unspecified finish and default display order', () => {
    const item=agendaItemPayload({title:'Opening remarks', startsAt:base.startsAt})
    expect(item.endsAt).toBe(null)
    expect(item.sortOrder).toBe(0)
  })
  test('rejects missing dates, malformed timezone and invalid calendar date', () => {
    expect(() => agendaItemPayload({ ...base, startsAt:'' })).toThrow('required')
    expect(() => agendaItemPayload({ ...base, startsAt:'2026-12-06T09:00' })).toThrow('UTC')
    expect(() => agendaItemPayload({ ...base, endsAt:'not-a-date' })).toThrow('UTC')
    expect(() => agendaItemPayload({ ...base, startsAt:'2026-02-30T09:00:00.000Z' })).toThrow('valid')
  })
  test('rejects reversed or zero-length sessions', () => {
    expect(() => agendaItemPayload({ ...base, endsAt:base.startsAt })).toThrow('after')
    expect(() => agendaItemPayload({ ...base, endsAt:'2026-12-06T08:59:00.000Z' })).toThrow('after')
  })
  test('rejects unsafe sort orders and very short titles', () => {
    expect(() => agendaItemPayload({ ...base, title:' ' })).toThrow('title')
    expect(() => agendaItemPayload({ ...base, sortOrder:1.5 })).toThrow('whole')
    expect(() => agendaItemPayload({ ...base, sortOrder:-1 })).toThrow('whole')
    expect(() => agendaItemPayload({ ...base, sortOrder:1001 })).toThrow('whole')
  })
  test('accepts Date objects for patching unchanged existing slots', () => {
    const row=agendaItemPayload({
      ...base, startsAt:new Date(base.startsAt), endsAt:new Date(base.endsAt),
    })
    expect(row.endsAt?.toISOString()).toBe(base.endsAt)
  })
})
