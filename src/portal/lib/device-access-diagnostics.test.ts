import { expect, test } from 'bun:test'
import { embeddedBrowserHint, permissionExplanation, testCaptureDevice } from './device-access-diagnostics'

test('recognizes common embedded browsers for advisory recovery only', () => {
  expect(embeddedBrowserHint('TikTok/30.0 Mobile')).toBe('TikTok')
  expect(embeddedBrowserHint('Mozilla/5.0 FBAN/FBIOS')).toBe('Facebook')
  expect(embeddedBrowserHint('Mozilla/5.0 Chrome/120.0 Mobile')).toBeNull()
})
test('permission diagnostics distinguish blocked, missing and busy hardware', () => {
  expect(permissionExplanation(Object.assign(new Error(), { name: 'NotAllowedError' }), 'microphone')).toContain('blocked')
  expect(permissionExplanation(Object.assign(new Error(), { name: 'NotFoundError' }), 'camera')).toContain('detected')
  expect(permissionExplanation(Object.assign(new Error(), { name: 'NotReadableError' }), 'camera')).toContain('another app')
})
test('direct device tests request one device only and always release all tracks', async () => {
  const calls: MediaStreamConstraints[] = []
  let stopped = 0
  const media = { getUserMedia: async (constraints: MediaStreamConstraints) => {
    calls.push(constraints)
    return { getTracks: () => [{ stop: () => { stopped++ } }] } as unknown as MediaStream
  } } as Pick<MediaDevices,'getUserMedia'>
  await testCaptureDevice('camera', media)
  await testCaptureDevice('microphone', media)
  expect(calls).toEqual([{ video: true, audio: false }, { video: false, audio: true }])
  expect(stopped).toBe(2)
})
test('unsupported media cannot claim a permission prompt', async () => {
  await expect(testCaptureDevice('camera')).rejects.toThrow('not available')
})
