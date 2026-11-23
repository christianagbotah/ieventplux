import { expect, test } from 'bun:test'
import { shouldOfferAndroidUpdate, validQaAndroidRelease } from './android-updates'

const current = { revision:'614f3b2',tag:'android-qa-614f3b2',
  downloadUrl:'https://github.com/christianagbotah/ieventplux/releases/download/android-qa-614f3b2/app-release.apk',
  publishedAt:'2026-11-23T22:52:45.000Z',notes:'Internal QA',sizeBytes:134348052 }
test('installed same commit is current', () => {
  expect(shouldOfferAndroidUpdate({release:current,installedRevision:'614f3b23ebc329ba6be3650d21ce60909c6818e5',installedBuiltAt:'2026-11-23T22:39:00Z'})).toBe(false)
})
test('later successful packaged release triggers update', () => {
  expect(shouldOfferAndroidUpdate({
    release:{...current,revision:'abcd123',tag:'android-qa-abcd123',
      downloadUrl:'https://github.com/christianagbotah/ieventplux/releases/download/android-qa-abcd123/app-release.apk',
      publishedAt:'2026-11-26T09:00:00Z'},
    installedRevision:'614f3b23ebc329ba6be3650d21ce60909c6818e5',
    installedBuiltAt:'2026-11-23T22:39:00Z',
  })).toBe(true)
})
test('older release does not downgrade current unpublished build', () => {
  expect(shouldOfferAndroidUpdate({release:current,installedRevision:'abcd123',installedBuiltAt:'2026-11-25T10:00:00Z'})).toBe(false)
})
test('rejects untrusted URLs and forged revisions', () => {
  expect(validQaAndroidRelease({...current,downloadUrl:'https://bad.invalid/apk'})).toBe(false)
  expect(validQaAndroidRelease({...current,tag:'android-qa-not-hex'})).toBe(false)
})
test('missing metadata cannot fabricate an update', () => {
  expect(shouldOfferAndroidUpdate({release:null,installedRevision:null,installedBuiltAt:null})).toBe(false)
})
