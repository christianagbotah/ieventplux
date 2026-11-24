import {expect,test} from 'bun:test'
import {readFileSync} from 'node:fs'
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8')

test('video upload is feature-gated, org-gated and quarantined as PROCESSING',()=>{
  const upload=read('../app/api/v1/uploads/route.ts')
  expect(upload).toContain('privateVideoIntakeEnabled()')
  expect(upload).toContain("form.get('rightsConfirmed') !== 'true'")
  expect(upload).toContain("form.get('consentConfirmed') !== 'true'")
  expect(upload).toContain("eventOrgAccess(user.id, eventId, 'media:manage')")
  expect(upload).toContain('privateVideoIntakePath(name)')
  expect(upload).toContain('mode: video ? 0o600 : 0o644')
  expect(upload).toContain('status: video ? \'PROCESSING\' : \'READY\'')
  expect(upload).toContain('if (video) return jsonOk({ asset: { id: asset.id')
})
test('reels and public organizer/event pages never return private pending video assets',()=>{
  const reels=read('../app/api/v1/discovery/[view]/route.ts')
  const org=read('../app/api/v1/orgs/[id]/profile/route.ts')
  const event=read('../app/api/v1/events/[id]/[action]/route.ts')
  expect(reels).toContain("kind: 'CLIP', status: 'READY'")
  expect(org).toContain("kind: 'CLIP', status: 'READY'")
  expect(event).toContain("status: 'READY'")
})
test('manager-only intake list excludes storage locators and prevents public caching',()=>{
  const code=read('../app/api/v1/orgs/[id]/clips/route.ts')
  expect(code).toContain("requireUser()")
  expect(code).toContain("orgCan(membership.role,'media:manage')")
  expect(code).toContain("'Cache-Control','private, no-store'")
  expect(code).not.toContain('select:{id:true,eventId:true,caption:true,url:true')
})
