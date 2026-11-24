import path from 'node:path'
import { mediaStorageDirectory } from '@/server/media-storage'

/** A staging intake only: signature/size checks do NOT replace malware,
 * copyright, abuse, consent or codec/transcoding review.
 * No submitted bytes can enter public /uploads until independently approved.
 */
export const MAX_PRIVATE_CLIP_BYTES = 25 * 1024 * 1024
export const MAX_PENDING_CLIPS_PER_ORG = 12
const PRIVATE_VIDEO_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:mp4|webm)$/i

export function privateVideoIntakeEnabled(env: Record<string,string|undefined> = process.env): boolean {
  return env.IEVENTPLUX_CREATOR_VIDEO_UPLOAD_ENABLED === 'true'
}

export function privateVideoMime(mime: string): 'mp4' | 'webm' | null {
  return mime === 'video/mp4' ? 'mp4' : mime === 'video/webm' ? 'webm' : null
}

/** Cheap container sniffing: not a promise the entire file is a valid video. */
export function hasVideoContainerSignature(bytes: Uint8Array, mime: string): boolean {
  if (bytes.length < 64 || bytes.length > MAX_PRIVATE_CLIP_BYTES) return false
  if (mime === 'video/mp4') {
    const magic = String.fromCharCode(...bytes.subarray(4,8))
    const brand = String.fromCharCode(...bytes.subarray(8,12))
    return magic === 'ftyp' && /^(?:isom|iso[2-6]|mp4[12]|avc1|M4V |dash|MSNV)$/.test(brand)
  }
  if (mime === 'video/webm') {
    if (![0x1a,0x45,0xdf,0xa3].every((part,index)=>bytes[index]===part)) return false
    const header = String.fromCharCode(...bytes.subarray(0,Math.min(bytes.length,4096)))
    return header.includes('webm')
  }
  return false
}

/** Quarantined under a directory that the public upload router cannot serve. */
export function privateVideoIntakeDirectory(root=mediaStorageDirectory()): string {
  return path.join(root,'pending-creator-videos')
}
export function privateVideoIntakePath(filename:string,root=mediaStorageDirectory()):string {
  if (!PRIVATE_VIDEO_NAME.test(filename)) throw new Error('Unsafe private video filename')
  return path.join(privateVideoIntakeDirectory(root),filename)
}
