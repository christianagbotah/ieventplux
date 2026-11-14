import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'
import { randomUUID } from 'crypto'

/**
 * POST /api/v1/uploads — bounded media upload (posters/gallery).
 * Type + size enforced; files stored under /public/uploads (S3-compatible adapter
 * is the production path — see docs/ARCHITECTURE.md).
 */
const ALLOWED = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
])
const MAX_BYTES = 5 * 1024 * 1024

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
    if (file.size > MAX_BYTES) throw errors.badRequest('File exceeds the 5MB limit.')

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

    const { writeFile, mkdir } = await import('fs/promises')
    const path = await import('path')
    const dir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(dir, { recursive: true })
    const name = `${randomUUID()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(dir, name), buffer)

    const asset = await db.mediaAsset.create({
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
    return jsonOk({ asset })
  })
}
