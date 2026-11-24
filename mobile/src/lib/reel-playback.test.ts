import {expect,test} from 'bun:test'
import {readFileSync} from 'node:fs'
import {trustedReelVideoUrl,visibleReelMayPlay} from './reel-playback'
const video='/uploads/123e4567-e89b-42d3-a456-426614174000.mp4'

test('only legitimate same-origin HTTPS UUID MP4 paths are recognized as real video',()=>{
  expect(trustedReelVideoUrl(video)).toBe('https://ieventplux.lightworldtech.com'+video)
  expect(trustedReelVideoUrl('https://ieventplux.lightworldtech.com'+video)).toBe('https://ieventplux.lightworldtech.com'+video)
  for(const source of [
    '',null,undefined,'/uploads/123e4567-e89b-42d3-a456-426614174000.jpg',
    '/uploads/123e4567-e89b-42d3-a456-426614174000.webm',
    'https://evil.example'+video,
    'http://ieventplux.lightworldtech.com'+video,
    '//evil.example'+video,
    video+'?redirect=elsewhere',video+'#fragment',
    '/uploads/../../secrets.mp4',
    '/uploads/123e4567-e89b-42d3-a456-426614174000.mp4/extra',
    '/uploads/unknown.mp4',
    'https://ieventplux.lightworldtech.com.evil.example'+video,
  ])expect(trustedReelVideoUrl(source)).toBeNull()
})

test('autoplay only with approved source, visible reel, foreground app, active tab, and no manual pause',()=>{
  const base={videoUrl:trustedReelVideoUrl(video),clipId:'clip-a',visibleClipId:'clip-a',screenFocused:true,appActive:true,userPaused:false}
  expect(visibleReelMayPlay(base)).toBe(true)
  expect(visibleReelMayPlay({...base,videoUrl:null})).toBe(false)
  expect(visibleReelMayPlay({...base,visibleClipId:'clip-b'})).toBe(false)
  expect(visibleReelMayPlay({...base,visibleClipId:null})).toBe(false)
  expect(visibleReelMayPlay({...base,screenFocused:false})).toBe(false)
  expect(visibleReelMayPlay({...base,appActive:false})).toBe(false)
  expect(visibleReelMayPlay({...base,userPaused:true})).toBe(false)
})

test('the UI never creates an off-screen video player or redirects to web for native playback',()=>{
  const media=readFileSync(new URL('../components/VerifiedReelMedia.tsx',import.meta.url),'utf8')
  const reels=readFileSync(new URL('../screens/ReelsScreen.tsx',import.meta.url),'utf8')
  expect(media).toContain('if(!source||!active)')
  expect(media).toContain('useVideoPlayer(source')
  expect(media).toContain('p.muted=true')
  expect(media).toContain('p.staysActiveInBackground=false')
  expect(media).toContain("player.addListener('statusChange'")
  expect(reels).toContain('onViewableItemsChanged={onViewableItemsChanged}')
  expect(reels).toContain('focused&&appActive&&visibleClipId===item.id')
  expect(reels).not.toContain('Linking.openURL')
})
