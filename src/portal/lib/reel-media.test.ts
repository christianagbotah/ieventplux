import { expect, test } from 'bun:test'
import { publishedReelVideoSrc } from './reel-media'
const clip = '/uploads/123e4567-e89b-42d3-a456-426614174000.mp4'

test('public Reels only recognize genuine same-origin published MP4 paths', () => {
  expect(publishedReelVideoSrc(clip)).toBe(clip)
  expect(publishedReelVideoSrc('https://ieventplux.lightworldtech.com' + clip)).toBe(clip)
  for (const path of [
    '', null, undefined, 'pending-video:123e4567-e89b-42d3-a456-426614174000.mp4',
    '/uploads/123e4567-e89b-42d3-a456-426614174000.jpg',
    '/uploads/123e4567-e89b-42d3-a456-426614174000.webm',
    '/uploads/fake.mp4', '/uploads/../../private.mp4',
    clip + '?download=true', clip + '#preview',
    'http://ieventplux.lightworldtech.com' + clip,
    'https://other.example' + clip,
    'https://ieventplux.lightworldtech.com.evil.example' + clip,
    '//' + 'other.example' + clip,
  ]) expect(publishedReelVideoSrc(path)).toBeNull()
})
