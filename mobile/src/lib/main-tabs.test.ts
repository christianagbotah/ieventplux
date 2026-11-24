import { expect, test } from 'bun:test'
import { MAIN_TABS, isMainTabRoute } from './main-tabs'

test('mobile shell shows five distinct navigable labels and destinations', () => {
  expect(MAIN_TABS.map(t => t.label)).toEqual(['Explore', 'Live', 'Shops', 'Tickets', 'You'])
  expect(new Set(MAIN_TABS.map(t => t.route)).size).toBe(5)
  MAIN_TABS.forEach(tab => expect(isMainTabRoute(tab.route)).toBe(true))
  expect(isMainTabRoute('EventDetail')).toBe(false)
  expect(isMainTabRoute('Login')).toBe(false)
})
