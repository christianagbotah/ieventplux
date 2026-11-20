import { describe, expect, test } from 'bun:test'
import { isDirectPlayableVideo } from './reel-media'

describe('Real video versus event preview', () => {
  test('accepts direct secure playable assets', () => {
    expect(isDirectPlayableVideo('https://cdn.example.com/clip.mp4?token=secure')).toBe(true)
    expect(isDirectPlayableVideo('/uploads/short.webm')).toBe(true)
    expect(isDirectPlayableVideo('http://localhost:3000/media/clip.mp4')).toBe(true)
  })
  test('rejects artwork, unknown providers, unsafe schemes and insecure remote HTTP', () => {
    for (const url of [
      'https://cdn.example.com/poster.jpg',
      'https://stream.example.com/abc123',
      'https://cdn.example.com/clip.m3u8',
      'https://cdn.example.com/clip.mp4.jpg',
      'javascript:alert(1)', 'data:video/mp4;base64,Zg==',
      'http://cdn.example.com/clip.mp4',
    ]) expect(isDirectPlayableVideo(url)).toBe(false)
  })
})
