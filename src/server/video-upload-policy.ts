/**
 * Narrow staging-only direct video upload policy.
 * Browser-supplied MIME is not trusted without container signature checks.
 * A valid container is NOT a virus scan, copyright check or transcoding pass.
 */
export const MAX_CLIP_UPLOAD_BYTES = 25 * 1024 * 1024
export const MAX_PENDING_CLIPS_PER_ORG = 12

export function isSupportedVideo(bytes: Uint8Array, mime: string): boolean {
  if (bytes.length < 64 || bytes.length > MAX_CLIP_UPLOAD_BYTES) return false
  if (mime === 'video/mp4') {
    const magic = String.fromCharCode(...bytes.subarray(4, 8))
    const brand = String.fromCharCode(...bytes.subarray(8, 12))
    return magic === 'ftyp' && /^(?:isom|iso[2-6]|mp4[12]|avc1|M4V |dash|MSNV)$/.test(brand)
  }
  if (mime === 'video/webm') {
    if (![0x1a, 0x45, 0xdf, 0xa3].every((byte, index) => bytes[index] === byte)) return false
    const header = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 4096)))
    return header.includes('webm')
  }
  return false
}

export function videoUploadsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.IEVENTPLUX_CREATOR_VIDEO_UPLOAD_ENABLED === 'true'
}

/**
 * Interpret one RFC 7233 byte range, including suffix requests.
 * Reject multi-range/invalid requests rather than sending incorrect video bytes.
 */
export function parseVideoByteRange(range: string, size: number): { start: number; end: number } {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error('Invalid media size')
  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match || (!match[1] && !match[2])) throw new Error('Invalid byte range')
  let start: number
  let end = size - 1
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix < 1) throw new Error('Invalid suffix range')
    start = Math.max(0, size - suffix)
  } else {
    start = Number(match[1])
    if (match[2]) end = Number(match[2])
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 0 || start >= size || end < start) throw new Error('Unsatisfiable byte range')
  return { start, end: Math.min(end, size - 1) }
}
