import path from 'node:path'
import { MAX_CLIP_UPLOAD_BYTES } from './video-upload-policy'

/**
 * Uploaded posters are mutable operational data, NOT build assets. Standalone
 * Next.js switches process.cwd() to .next/standalone, so public/uploads files
 * created there are not reliably discoverable, and deployment removes them.
 * Keep media under a durable absolute path and stream it through a route.
 */
const MEDIA_TYPES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
} as const

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const MAX_VIDEO_UPLOAD_BYTES = MAX_CLIP_UPLOAD_BYTES
const PUBLIC_MEDIA_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp|mp4|webm)$/i

export function isPublicUploadName(name: string): boolean {
  return PUBLIC_MEDIA_NAME.test(name)
}

export function mimeForUploadName(name: string): string | null {
  if (!isPublicUploadName(name)) return null
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase() as keyof typeof MEDIA_TYPES
  return MEDIA_TYPES[extension] ?? null
}

/** Verify bytes as well as browser-supplied MIME; reject empty/spoofed uploads. */
export function isSupportedImage(bytes: Uint8Array, mime: string): boolean {
  if (bytes.length < 12 || bytes.length > MAX_UPLOAD_BYTES) return false
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mime === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  if (mime === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  return false
}

export function mediaStorageDirectory(): string {
  const directory = process.env.IEVENTPLUX_UPLOADS_DIR?.trim()
  if (directory) {
    if (!path.isAbsolute(directory)) throw new Error('IEVENTPLUX_UPLOADS_DIR must be an absolute path.')
    return directory
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Persistent media storage is not configured.')
  return path.join(process.cwd(), 'storage', 'uploads')
}

export function mediaFilePath(name: string): string {
  if (!isPublicUploadName(name)) throw new Error('Invalid public media filename.')
  return path.join(mediaStorageDirectory(), name)
}
