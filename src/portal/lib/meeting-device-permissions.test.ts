import { expect, test } from 'bun:test'
import { requestMeetingDevicePermissions } from './meeting-device-permissions'

test('listen-only access never needs a device or permission prompt', async () => {
  await expect(requestMeetingDevicePermissions({ microphone: false, camera: false })).resolves.toBeUndefined()
})
test('camera and microphone permissions requested together and preview tracks stopped', async () => {
  const requests: MediaStreamConstraints[] = []
  let stops = 0
  const devices = { getUserMedia: async (constraints: MediaStreamConstraints) => {
    requests.push(constraints)
    return { getTracks: () => [{ stop: () => { stops++ } }, { stop: () => { stops++ } }] } as unknown as MediaStream
  }} as Pick<MediaDevices, 'getUserMedia'>
  await requestMeetingDevicePermissions({ microphone: true, camera: true }, devices)
  expect(requests).toEqual([{ audio: true, video: true }])
  expect(stops).toBe(2)
})
test('permission denial and in-app browser restrictions explain fallback', async () => {
  const reject = { getUserMedia: async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }) } } as Pick<MediaDevices, 'getUserMedia'>
  await expect(requestMeetingDevicePermissions({ microphone: true, camera: true }, reject)).rejects.toThrow('permission was denied')
  await expect(requestMeetingDevicePermissions({ microphone: true, camera: false })).rejects.toThrow('Chrome or Samsung Internet')
})
