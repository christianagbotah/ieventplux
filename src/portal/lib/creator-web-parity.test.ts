import {test,expect} from 'bun:test'
import {readFileSync} from 'node:fs'
const root = new URL('../',import.meta.url)
const source=(relative:string)=>readFileSync(new URL(relative,root),'utf8')

test('Organizer web workspace exposes Creator Media only to a media-manager role',()=>{
  const code=source('views/OrganizerWorkspace.tsx')
  expect(code).toContain("key: 'creator-media'")
  expect(code).toContain("['meetings', 'creator-media'].includes(item.key) && !canManageEvents")
  expect(code).toContain("<CreatorClipsStudio orgId={activeOrg.orgId} />")
})
test('Web creator uploads require genuine event, rights and participant consent then refresh queue',()=>{
  const code=source('components/CreatorClipsStudio.tsx')
  expect(code).toContain("api.get<StudioPayload>(`/orgs/${orgId}/clips`)")
  expect(code).toContain("api.upload<")
  expect(code).toContain("form.append('rightsConfirmed', 'true')")
  expect(code).toContain("form.append('consentConfirmed', 'true')")
  expect(code).toContain('await refresh()')
  expect(code).toContain('request !== revision.current')
  expect(code).toContain('!payload?.enabled || busy')
  expect(code).toContain("result.asset.status !== 'PROCESSING'")
})
test('Web Reels uses real browser media and never opens a fake player for poster-only previews',()=>{
  const reel=source('views/Reels.tsx')
  const media=source('components/ReelPlayableMedia.tsx')
  expect(reel).toContain('publishedReelVideoSrc(c.url)')
  expect(reel).toContain('<ReelPlayableMedia')
  expect(reel).toContain('IntersectionObserver')
  expect(reel).toContain('best && best[1]>=0.65')
  expect(media).toContain('if (!url || !active || !pageVisible || failed)')
  expect(media).toContain('<video ref={ref}')
  expect(media).toContain('preload="none"')
  expect(media).toContain('muted={muted}')
})
