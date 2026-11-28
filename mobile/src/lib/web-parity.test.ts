/** Prevent platform UI copy/navigation/colors from drifting silently. */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { MAIN_TABS } from './main-tabs'
import { HOME_STORIES } from './home-stories'
import { theme } from '../theme'

const portal = readFileSync(new URL('../../../src/portal/AppPortal.tsx', import.meta.url), 'utf8')
const discover = readFileSync(new URL('../../../src/portal/views/Discover.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../../src/app/globals.css', import.meta.url), 'utf8')

test('Native nav preserves shared destinations and adds a visible creation entry', () => {
  const mobileSection = portal.split('const MOBILE_NAV = [')[1]?.split('\n]')[0]
  expect(mobileSection).toBeTruthy()
  const webLabels = Array.from(mobileSection?.matchAll(/label: '([^']+)'/g) ?? []).map(match => match[1])
  // Intentional native UX exception: the owner requested direct creation access.
  // Reels is kept one tap away on Discover and in the creation hub.
  expect(MAIN_TABS.map(item => item.label).filter(label=>label!=='Create')).toEqual(webLabels.filter(label=>label!=='Reels'))
  expect(MAIN_TABS.some(item=>item.route==='CreateHub')).toBe(true)
  expect(readFileSync(new URL('../screens/DiscoverScreen.tsx',import.meta.url),'utf8')).toContain("navigation.navigate('Reels')")
})

test('all homepage editorial slider stories are the same on Android and web', () => {
  const webHeroSection = discover.split('const HERO_STORIES = [')[1]?.split('] as const')[0]
  expect(webHeroSection).toBeTruthy()
  for (const story of HOME_STORIES) {
    for (const copy of [story.kicker, story.line, story.accent, story.description, story.label]) {
      expect(webHeroSection).toContain(copy)
    }
  }
})

test('native semantic colors track the web brand variables', () => {
  const pairs = [
    ['--ievx-canvas',theme.colors.bg],
    ['--ievx-panel',theme.colors.card],
    ['--ievx-ink',theme.colors.text],
    ['--ievx-ink-soft',theme.colors.textMuted],
    ['--ievx-line',theme.colors.border],
    ['--ievx-teal',theme.colors.primary],
    ['--ievx-teal-soft',theme.web.tealSoft],
  ] as const
  for (const [variable, value] of pairs) expect(css).toContain(`${variable}: ${value};`)
})

test('native public launch and authenticated-tab gates match web public entry', () => {
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8')
  expect(app).toContain("initialRouteName='Discover'")
  expect(app).toContain('requiresAuthentication(route)')
})
