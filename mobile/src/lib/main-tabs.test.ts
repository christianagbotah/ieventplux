import { expect, test } from 'bun:test'
import { MAIN_TABS, isMainTabRoute, requiresAuthentication } from './main-tabs'

test('native primary destinations mirror web mobile navigation', () => {
  expect(MAIN_TABS.map(t => t.label)).toEqual(['Discover', 'Feed', 'Reels', 'Shop', 'Tickets', 'Account'])
  expect(new Set(MAIN_TABS.map(t => t.route)).size).toBe(6)
  MAIN_TABS.forEach(tab => expect(isMainTabRoute(tab.route)).toBe(true))
  expect(isMainTabRoute('EventDetail')).toBe(false)
  expect(isMainTabRoute('Login')).toBe(false)
  expect(requiresAuthentication('MyTickets')).toBe(true)
  expect(requiresAuthentication('Account')).toBe(true)
  expect(requiresAuthentication('Discover')).toBe(false)
  expect(requiresAuthentication('Following')).toBe(false)
  expect(requiresAuthentication('Reels')).toBe(false)
  expect(requiresAuthentication('Marketplace')).toBe(false)
})
