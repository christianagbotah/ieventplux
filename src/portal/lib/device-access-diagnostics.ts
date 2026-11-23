/** Non-invasive diagnostics: never acquires media until the user taps Test. */
export type MediaDeviceKind = 'camera' | 'microphone'

export function embeddedBrowserHint(userAgent: string): string | null {
  // User agent detection is advisory, never an entitlement or media gate.
  if (/TikTok|musical_ly|BytedanceWebview|Aweme/i.test(userAgent)) return 'TikTok'
  if (/Instagram/i.test(userAgent)) return 'Instagram'
  if (/FBAN|FBAV|FB_IAB|Facebook/i.test(userAgent)) return 'Facebook'
  if (/Line\//i.test(userAgent)) return 'LINE'
  if (/Snapchat/i.test(userAgent)) return 'Snapchat'
  return null
}

export function permissionExplanation(error: unknown, kind: MediaDeviceKind): string {
  const label = kind === 'camera' ? 'Camera' : 'Microphone'
  const name = error instanceof Error ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return `${label} access was blocked or denied. Open the link in Chrome or Samsung Internet, or allow it in your browser's site settings.`
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return `No ${label.toLowerCase()} was detected on this device.`
    case 'NotReadableError':
    case 'TrackStartError':
      return `Your ${label.toLowerCase()} is unavailable or being used by another app. Close other camera/recording apps and retry.`
    default:
      return `${label} could not start in this browser. Try Chrome or Samsung Internet or join with that device switched off.`
  }
}

export async function testCaptureDevice(
  kind: MediaDeviceKind,
  media?: Pick<MediaDevices, 'getUserMedia'>,
): Promise<void> {
  if (!media || typeof media.getUserMedia !== 'function') {
    throw new Error('Camera and microphone capture is not available in this browser. Open the meeting in Chrome or Samsung Internet.')
  }
  let stream: MediaStream | undefined
  try {
    stream = await media.getUserMedia({
      video: kind === 'camera',
      audio: kind === 'microphone',
    })
  } catch (error) {
    throw new Error(permissionExplanation(error, kind))
  } finally {
    // A permission test is NOT a recording or call. Release every preview track.
    stream?.getTracks().forEach((track) => track.stop())
  }
}
