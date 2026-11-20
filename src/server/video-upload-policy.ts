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
