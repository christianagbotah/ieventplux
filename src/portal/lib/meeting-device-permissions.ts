/**
 * Camera and microphone preflight must begin directly from the user's Join
 * gesture, before token/network awaits (Android in-app browsers in particular).
 */
export type DeviceChoices = { microphone: boolean; camera: boolean }

export async function requestMeetingDevicePermissions(
  choices: DeviceChoices,
  devices?: Pick<MediaDevices, 'getUserMedia'>,
): Promise<void> {
  if (!choices.microphone && !choices.camera) return
  if (!devices?.getUserMedia) {
    throw new Error('This browser does not support camera and microphone access. Open the meeting link in Chrome or Samsung Internet, or turn both devices off to join as a listener.')
  }
  try {
    const stream = await devices.getUserMedia({
      audio: choices.microphone,
      video: choices.camera,
    })
    // LiveKit opens its own tracks after the authenticated room connects.
    // Release the temporary permission-test stream immediately.
    stream.getTracks().forEach((track) => track.stop())
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      throw new Error('Camera or microphone permission was denied or blocked. Allow access in browser settings, turn off the unavailable device, or open this meeting in Chrome or Samsung Internet.')
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      throw new Error('A selected camera or microphone was not found. Turn off the unavailable device below and try again.')
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      throw new Error('The selected camera or microphone is being used by another app. Close the other app or join with that device turned off.')
    }
    throw new Error('This browser could not start the selected camera or microphone. Check its permissions, or turn the devices off to join as a listener.')
  }
}
