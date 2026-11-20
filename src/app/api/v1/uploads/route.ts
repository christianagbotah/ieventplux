import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'
import { randomUUID } from 'crypto'
import { join } from 'node:path'
import { sanitizeText } from '@/server/api'
import { isSupportedImage, mediaFilePath, mediaStorageDirectory, MAX_UPLOAD_BYTES } from '@/server/media-storage'
import { isSupportedVideo, MAX_CLIP_UPLOAD_BYTES, MAX_PENDING_CLIPS_PER_ORG, videoUploadsEnabled } from '@/server/video-upload-policy'

/**
 * POST /api/v1/uploads — bounded media upload (posters/gallery/programmes).
 * Video files are an explicit staging pilot; they remain PROCESSING until
 * external safety/transcoding/moderation gates approve publication.
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
    const kind = ['POSTER', 'GALLERY', 'CLIP', 'PROGRAMME', 'SPEAKER_PHOTO', 'MERCH_PHOTO'].includes(String(form.get('kind'))) ? String(form.get('kind')) : 'GALLERY'
    const programme = kind === 'PROGRAMME'
    if (!(file instanceof File)) throw errors.badRequest('A file is required.')
    const video = kind === 'CLIP' && ['video/mp4', 'video/webm'].includes(file.type)
    if (video && !videoUploadsEnabled()) {
      throw errors.forbidden('Creator video uploads are not enabled on this server.')
    }
    if (video && (!eventId || form.get('rightsConfirmed') !== 'true' || form.get('consentConfirmed') !== 'true')) {
      throw errors.badRequest('Choose an event and confirm your rights and participant consent before uploading video.')
    }
    const ext = video ? (file.type === 'video/mp4' ? 'mp4' : 'webm')
      : programme && file.type === 'application/pdf' ? 'pdf' : ALLOWED.get(file.type)
    if (!ext || (programme && ext !== 'pdf') || (!programme && ext === 'pdf')) {
      throw errors.badRequest(programme ? 'Programme outlines must be PDF files.' : 'Only PNG, JPEG or WebP images are allowed, plus MP4/WebM clips in the video pilot.')
    }
    const max = video ? MAX_CLIP_UPLOAD_BYTES : programme ? 10 * 1024 * 1024 : MAX_UPLOAD_BYTES
    if (file.size === 0 || file.size > max) {
      throw errors.badRequest(`File must be between 1 byte and ${video ? '25MB' : programme ? '10MB' : '5MB'}.`)
    }
    if (programme && !eventId) throw errors.badRequest('Choose the event for this programme PDF.')

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

    // A media row without a genuine organizer is never a valid fallback;
    // the previous "personal" placeholder could only fail the org FK.
    if (!orgId) throw errors.badRequest('Select an organizer or event to upload media.')
    if (video) {
      const event = await db.event.findFirst({
        where: { id: eventId as string, orgId, deletedAt: null, status: { not: 'CANCELLED' },
          org: { status: 'ACTIVE', deletedAt: null } },
        select: { id: true },
      })
      if (!event) throw errors.forbidden('Video uploads require an active organizer and a valid event.')
      const pending = await db.mediaAsset.count({ where: { orgId, kind: 'CLIP', status: 'PROCESSING' } })
      if (pending >= MAX_PENDING_CLIPS_PER_ORG) {
        throw errors.badRequest('You have reached the pending-video review limit. Please wait for moderation.')
      }
    }

    const { writeFile, mkdir, unlink } = await import('fs/promises')
    const buffer = Buffer.from(await file.arrayBuffer())
    const pdfHeader = buffer.length >= 9 && buffer.subarray(0, 5).toString('latin1') === '%PDF-' && buffer.subarray(-2048).toString('latin1').includes('%%EOF')
    if (programme ? !pdfHeader : video ? !isSupportedVideo(buffer, file.type) : !isSupportedImage(buffer, file.type)) {
      throw errors.badRequest(programme ? 'The PDF file is invalid or incomplete.'
        : video ? 'The clip must be a valid MP4 or WebM container, within 25MB.'
          : 'The uploaded image is empty, corrupt, too large, or does not match its declared image type.')
    }
    const name = `${randomUUID()}.${ext}`
    let filePath: string
    try {
      filePath = programme ? join(mediaStorageDirectory(), name) : mediaFilePath(name)
      await mkdir(mediaStorageDirectory(), { recursive: true })
      await writeFile(filePath, buffer, { flag: 'wx', mode: video ? 0o600 : 0o644 })
    } catch {
      throw errors.unavailable('MEDIA_STORAGE_UNAVAILABLE', 'The image could not be saved. Please try again or contact support.')
    }

    let asset
    try {
      asset = await db.mediaAsset.create({
        data: {
          orgId,
          eventId,
          uploaderId: user.id,
          kind,
          url: programme ? `programme:${name}` : `/uploads/${name}`,
          caption: sanitizeText(form.get('caption') ?? (programme ? file.name : ''), 200) || null,
          // Do not claim content scanning/transcoding or make raw videos public.
          // Publication requires a separate vetted moderation workflow.
          status: video ? 'PROCESSING' : 'READY',
        },
      })
    } catch (error) {
      await unlink(filePath).catch(() => {})
      throw error
    }
    return jsonOk({ asset: { ...asset, url: programme ? `/api/v1/events/${eventId}/programmes/${asset.id}` : asset.url } })
  })
}
