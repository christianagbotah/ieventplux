import {expect,test} from 'bun:test'
import { MAX_PRIVATE_CLIP_BYTES, MAX_PENDING_CLIPS_PER_ORG,hasVideoContainerSignature,privateVideoIntakeEnabled,privateVideoIntakePath,privateVideoMime } from './private-video-intake'

const mp4=new Uint8Array(80)
mp4.set([0,0,0,24,0x66,0x74,0x79,0x70,0x69,0x73,0x6f,0x6d],0)
const webm=new Uint8Array(80)
webm.set([0x1a,0x45,0xdf,0xa3],0)
webm.set(new TextEncoder().encode('webm'),15)

test('private creator video intake defaults to disabled without explicit staged flag',()=>{
  expect(privateVideoIntakeEnabled({})).toBe(false)
  expect(privateVideoIntakeEnabled({IEVENTPLUX_CREATOR_VIDEO_UPLOAD_ENABLED:'false'})).toBe(false)
  expect(privateVideoIntakeEnabled({IEVENTPLUX_CREATOR_VIDEO_UPLOAD_ENABLED:'true'})).toBe(true)
})
test('only bounded MP4/WebM containers can enter private quarantine, not browser MIME alone',()=>{
  expect(hasVideoContainerSignature(mp4,'video/mp4')).toBe(true)
  expect(hasVideoContainerSignature(webm,'video/webm')).toBe(true)
  expect(hasVideoContainerSignature(mp4,'video/webm')).toBe(false)
  expect(hasVideoContainerSignature(webm,'video/mp4')).toBe(false)
  expect(hasVideoContainerSignature(new Uint8Array(80),'video/mp4')).toBe(false)
  expect(hasVideoContainerSignature(mp4,'image/png')).toBe(false)
  expect(hasVideoContainerSignature(new Uint8Array(63),'video/mp4')).toBe(false)
  expect(hasVideoContainerSignature(new Uint8Array(MAX_PRIVATE_CLIP_BYTES+1),'video/mp4')).toBe(false)
  expect(privateVideoMime('video/mp4')).toBe('mp4')
  expect(privateVideoMime('video/webm')).toBe('webm')
  expect(privateVideoMime('video/quicktime')).toBeNull()
  expect(MAX_PENDING_CLIPS_PER_ORG).toBe(12)
})
test('private quarantine excludes traversal and never produces a public uploads URL',()=>{
  const storageRoot='/tmp/ieventplux-quarantine-test'
  const path=privateVideoIntakePath('123e4567-e89b-42d3-a456-426614174000.mp4',storageRoot)
  expect(path).toBe('/tmp/ieventplux-quarantine-test/pending-creator-videos/123e4567-e89b-42d3-a456-426614174000.mp4')
  expect(path).not.toContain('/uploads/')
  expect(()=>privateVideoIntakePath('../etc/passwd',storageRoot)).toThrow()
  expect(()=>privateVideoIntakePath('a.mp4',storageRoot)).toThrow()
})
