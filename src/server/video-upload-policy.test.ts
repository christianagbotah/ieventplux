import { describe, expect, test } from 'bun:test'
import { isSupportedVideo, MAX_CLIP_UPLOAD_BYTES, parseVideoByteRange, videoUploadsEnabled } from './video-upload-policy'

function bytes(size: number) { return new Uint8Array(size) }
const mp4 = bytes(96)
mp4.set(new TextEncoder().encode('ftypisom'), 4)
const webm = bytes(96)
webm.set([0x1a, 0x45, 0xdf, 0xa3])
webm.set(new TextEncoder().encode('webm'), 30)

describe('Creator video upload policy', () => {
  test('defaults off until a deliberate server-side enablement', () => {
    expect(videoUploadsEnabled({})).toBe(false)
    expect(videoUploadsEnabled({ IEVENTPLUX_CREATOR_VIDEO_UPLOAD_ENABLED: 'TRUE' })).toBe(false)
    expect(videoUploadsEnabled({ IEVENTPLUX_CREATOR_VIDEO_UPLOAD_ENABLED: 'true' })).toBe(true)
  })
  test('allows matching MP4 and WebM containers within the bounded size', () => {
    expect(isSupportedVideo(mp4, 'video/mp4')).toBe(true)
    expect(isSupportedVideo(webm, 'video/webm')).toBe(true)
    expect(isSupportedVideo(mp4, 'video/webm')).toBe(false)
    expect(isSupportedVideo(webm, 'video/mp4')).toBe(false)
  })
  test('rejects spoofed, truncated, oversized or unsupported files', () => {
    expect(isSupportedVideo(bytes(96), 'video/mp4')).toBe(false)
    expect(isSupportedVideo(bytes(3), 'video/mp4')).toBe(false)
    expect(isSupportedVideo(mp4, 'video/quicktime')).toBe(false)
    expect(isSupportedVideo(bytes(MAX_CLIP_UPLOAD_BYTES + 1), 'video/mp4')).toBe(false)
  })
})

describe('Browser video byte-range requests', () => {
  test('serves bounded single and suffix ranges', () => {
    expect(parseVideoByteRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 })
    expect(parseVideoByteRange('bytes=10-49', 100)).toEqual({ start: 10, end: 49 })
    expect(parseVideoByteRange('bytes=99-999', 100)).toEqual({ start: 99, end: 99 })
    expect(parseVideoByteRange('bytes=-20', 100)).toEqual({ start: 80, end: 99 })
    expect(parseVideoByteRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 })
  })
  test('rejects ranges that would mislead browser playback', () => {
    for (const range of ['bytes=100-', 'bytes=30-20', 'bytes=-0', 'bytes=', 'bytes=0-1,5-10', 'items=0-5', 'bytes=0-1-2', 'bytes=NaN-10']) {
      expect(() => parseVideoByteRange(range, 100)).toThrow()
    }
    expect(() => parseVideoByteRange('bytes=0-', 0)).toThrow()
  })
})
