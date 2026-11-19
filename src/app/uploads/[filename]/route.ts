import { NextRequest } from 'next/server'
import { readFile } from 'node:fs/promises'
import { mediaFilePath, mimeForUploadName, MAX_UPLOAD_BYTES } from '@/server/media-storage'

type RouteContext = { params: Promise<{ filename: string }> }

/** Public, cacheable posters. Sensitive KYC evidence uses its own gated API,
 * never this route. UUID filenames are validated before filesystem access. */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { filename } = await ctx.params
  const mime = mimeForUploadName(filename)
  if (!mime) return new Response('Image not found.', { status: 404, headers: { 'Cache-Control': 'no-store' } })

  try {
    const bytes = await readFile(mediaFilePath(filename))
    if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new Error('Invalid image data')
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(bytes.length),
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return new Response('Image not found.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
}
