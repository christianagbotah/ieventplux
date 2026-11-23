import { expect, test } from 'bun:test'
import { latestAndroidQaRelease } from './android-qa-release-policy'

function item(tag: string, date = '2026-11-23T22:52:45.000Z') {
  return {
    draft: false, prerelease: true, tag_name: tag, published_at: date,
    body: 'Internal Android QA release.',
    assets: [{ name: 'app-release.apk', size: 134348052,
      browser_download_url: 'https://github.com/christianagbotah/ieventplux/releases/download/' + tag + '/app-release.apk' }],
  }
}
test('selects newest verified QA release by publication time', () => {
  const r = latestAndroidQaRelease([
    item('android-qa-614f3b2'),
    item('android-qa-8a7d5c3', '2026-11-24T12:00:00Z'),
  ])
  expect(r?.revision).toBe('8a7d5c3')
  expect(r?.sizeBytes).toBe(134348052)
})
test('returns null for unverified, unpublished, or draft releases', () => {
  expect(latestAndroidQaRelease(null)).toBeNull()
  expect(latestAndroidQaRelease([{ ...item('android-qa-614f3b2'), draft: true }])).toBeNull()
  expect(latestAndroidQaRelease([{ ...item('android-qa-614f3b2'), prerelease: false }])).toBeNull()
  expect(latestAndroidQaRelease([{ ...item('android-qa-test') }])).toBeNull()
})
test('never trusts cross-repository or unapproved download links', () => {
  const r = item('android-qa-614f3b2')
  r.assets[0].browser_download_url = 'https://evil.invalid/app-release.apk'
  expect(latestAndroidQaRelease([r])).toBeNull()
  r.assets[0].browser_download_url = 'https://github.com/other/repo/releases/download/android-qa-614f3b2/app-release.apk'
  expect(latestAndroidQaRelease([r])).toBeNull()
})
test('does not advertise missing or unusually small APK assets', () => {
  const r = item('android-qa-614f3b2')
  r.assets[0].size = 500
  expect(latestAndroidQaRelease([r])).toBeNull()
})
