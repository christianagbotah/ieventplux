import { NextRequest } from 'next/server'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { db } from '@/lib/db'
import { mediaFilePath, mimeForUploadName, MAX_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES } from '@/server/media-storage'
import { parseVideoByteRange } from '@/server/video-upload-policy'

type RouteContext = { params: Promise<{ filename: string }> }

/**
 * Images retain their existing UUID-based public URLs. Video bytes are never
 * accessible until an authorized moderation pipeline changes the DB asset to
 * READY and the event/organizer are public and active. Unknown filenames
 * never reach disk. This is not a transcoding/CDN implementation.
 */
async function serve(req: NextRequest, ctx: RouteContext) {
  const { filename } = await ctx.params
  const mime = mimeForUploadName(filename)
  if (!mime) return new Response('Media not found.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const video = mime === 'video/mp4' || mime === 'video/webm'
  if (video) {
    const published = await db.mediaAsset.findFirst({
      where: {
        url: '/uploads/' + filename, kind: 'CLIP', status: 'READY',
        org: { status: 'ACTIVE', deletedAt: null },
        event: {
          visibility: 'PUBLIC', deletedAt: null, status: { in: ['PUBLISHED', 'LIVE', 'ENDED'] },
          org: { status: 'ACTIVE', deletedAt: null },
        },
      },
      select: { id: true },
    })
    if (!published) return new Response('Media not available.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    const fullPath = mediaFilePath(filename)
    const info = await stat(fullPath)
    if (!info.isFile() || !info.size || info.size > (video ? MAX_VIDEO_UPLOAD_BYTES : MAX_UPLOAD_BYTES)) {
      throw new Error('Invalid file size')
    }

    let start = 0
    let end = info.size - 1
    const range = video ? req.headers.get('range') : null
    if (range) {
      try {
        ;({ start, end } = parseVideoByteRange(range, info.size))
      } catch {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${info.size}`, 'Cache-Control': 'no-store' },
        })
      }
    }

    const size = end - start + 1
    const headers = {
      'Content-Type': mime,
      'Content-Length': String(size),
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cache-Control': video ? 'no-store' : 'public, max-age=3600',
      ...(video ? { 'Accept-Ranges': 'bytes' } : {}),
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}),
    }
    const status = range ? 206 : 200
    if (req.method === 'HEAD') return new Response(null, { status, headers })
    const stream = createReadStream(fullPath, { start, end })
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, { status, headers })
  } catch {
    return new Response('Media not found.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return serve(req, ctx)
}

export async function HEAD(req: NextRequest, ctx: RouteContext) {
  return serve(req, ctx)
}
