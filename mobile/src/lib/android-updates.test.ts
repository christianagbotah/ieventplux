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

test('official GitHub fallback finds the newest published signed QA APK',async()=>{
  const {latestQaAndroidFromGithub,newestVerifiedQaAndroidRelease}=await import('./android-updates')
  const entry=(rev:string,date:string,asset='app-release.apk')=>({
    draft:false,prerelease:true,tag_name:'android-qa-'+rev,published_at:date,body:'Android QA',
    assets:[{name:asset,size:134455000,browser_download_url:'https://github.com/christianagbotah/ieventplux/releases/download/android-qa-'+rev+'/'+asset}],
  })
  const old=entry('e7f73f3','2026-11-24T02:55:38Z')
  const newest=entry('39b1340','2026-11-24T12:16:20Z')
  const ignored=entry('bad0000','2026-11-25T12:16:20Z')
  ignored.assets[0]!.browser_download_url='https://attacker.invalid/download.apk'
  const chosen=latestQaAndroidFromGithub([old,{...newest,draft:true},ignored,newest])
  expect(chosen?.revision).toBe('39b1340')
  expect(newestVerifiedQaAndroidRelease({revision:'e7f73f3',tag:old.tag_name,publishedAt:old.published_at,downloadUrl:old.assets[0]!.browser_download_url,notes:'',sizeBytes:134455000},chosen)?.revision).toBe('39b1340')
})
test('fallback discards invented commits and unofficial domains',async()=>{
  const {latestQaAndroidFromGithub}=await import('./android-updates')
  expect(latestQaAndroidFromGithub([{draft:false,prerelease:true,tag_name:'android-qa-deadbee',published_at:'2026-11-25',assets:[{name:'app-release.apk',size:20000000,browser_download_url:'https://malicious.example/evil.apk'}]}])).toBeNull()
  expect(latestQaAndroidFromGithub([{draft:false,prerelease:false,tag_name:'android-qa-deadbee',published_at:'2026-11-25',assets:[{name:'app-release.apk',size:20000000,browser_download_url:'https://github.com/christianagbotah/ieventplux/releases/download/android-qa-deadbee/app-release.apk'}]}])).toBeNull()
})
