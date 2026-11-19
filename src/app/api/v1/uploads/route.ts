import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'
import { randomUUID } from 'crypto'
import { isSupportedImage, mediaFilePath, mediaStorageDirectory, MAX_UPLOAD_BYTES } from '@/server/media-storage'

/**
 * POST /api/v1/uploads — bounded media upload (posters/gallery).
 * Uploaded media lives in durable storage outside the Next.js release tree;
 * public URLs use the dedicated dynamic /uploads/[filename] route.
 */
const ALLOWED = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
])

export async function POST(req: NextRequest) {
  return handle(async () => {
    await rateLimit(req, 'upload', 20, 60_000)
    const user = await requireUser()
    const form = await req.formData().catch(() => null)
    if (!form) throw errors.badRequest('Multipart form required.')
    const file = form.get('file')
    const eventId = form.get('eventId') ? String(form.get('eventId')) : null
    const kind = ['POSTER', 'GALLERY', 'CLIP'].includes(String(form.get('kind'))) ? String(form.get('kind')) : 'GALLERY'
    if (!(file instanceof File)) throw errors.badRequest('A file is required.')
    const ext = ALLOWED.get(file.type)
    if (!ext) throw errors.badRequest('Only PNG, JPEG or WebP images are allowed.')
    if (file.size > MAX_UPLOAD_BYTES) throw errors.badRequest('File exceeds the 5MB limit.')

    // Org scoping: upload to an event requires event media permission; otherwise org media library.
    let orgId: string | null = null
    if (eventId) {
      const access = await eventOrgAccess(user.id, eventId, 'media:manage')
      if (!access.event) throw errors.notFound('Event not found.')
      if (!access.allowed) throw errors.forbidden('Media uploads require an organizer role.')
      orgId = access.event.orgId
    } else {
      const orgIdRaw = form.get('orgId')
      if (orgIdRaw) {
        const { membershipFor, orgCan } = await import('@/server/permissions')
        const membership = await membershipFor(user.id, String(orgIdRaw))
        if (!membership || !orgCan(membership.role, 'media:manage')) throw errors.forbidden('Media uploads require an organizer role.')
        orgId = membership.orgId
      }
    }

    const { writeFile, mkdir, unlink } = await import('fs/promises')
    const buffer = Buffer.from(await file.arrayBuffer())
    if (!isSupportedImage(buffer, file.type)) {
      throw errors.badRequest('The uploaded image is empty, corrupt, too large, or does not match its declared image type.')
    }
    const name = `${randomUUID()}.${ext}`
    let filePath: string
    try {
      filePath = mediaFilePath(name)
      await mkdir(mediaStorageDirectory(), { recursive: true })
      await writeFile(filePath, buffer, { flag: 'wx', mode: 0o644 })
    } catch {
      throw errors.unavailable('MEDIA_STORAGE_UNAVAILABLE', 'The image could not be saved. Please try again or contact support.')
    }

    let asset
    try {
      asset = await db.mediaAsset.create({
        data: {
          orgId: orgId ?? 'personal',
          eventId,
          uploaderId: user.id,
          kind,
          url: `/uploads/${name}`,
          caption: form.get('caption') ? String(form.get('caption')).slice(0, 200) : null,
          status: 'READY',
        },
      })
    } catch (error) {
      await unlink(filePath).catch(() => {})
      throw error
    }
    return jsonOk({ asset })
  })
}
