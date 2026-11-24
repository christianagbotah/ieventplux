import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors, rateLimit } from '@/server/api'
import { db } from '@/lib/db'
import { eventOrgAccess } from '@/server/permissions'
import { randomUUID } from 'crypto'
import { join } from 'node:path'
import { sanitizeText } from '@/server/api'
import { isSupportedImage, mediaFilePath, mediaStorageDirectory, MAX_UPLOAD_BYTES } from '@/server/media-storage'
import { MAX_PRIVATE_CLIP_BYTES, MAX_PENDING_CLIPS_PER_ORG, hasVideoContainerSignature,
  privateVideoIntakeDirectory, privateVideoIntakeEnabled, privateVideoIntakePath, privateVideoMime } from '@/server/private-video-intake'

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
    const kind = ['POSTER', 'GALLERY', 'CLIP', 'PROGRAMME', 'SPEAKER_PHOTO', 'MERCH_PHOTO'].includes(String(form.get('kind'))) ? String(form.get('kind')) : 'GALLERY'
    const programme = kind === 'PROGRAMME'
    if (!(file instanceof File)) throw errors.badRequest('A file is required.')
    const videoExt = kind === 'CLIP' ? privateVideoMime(file.type) : null
    const video = videoExt !== null
    if (video && !privateVideoIntakeEnabled()) throw errors.forbidden('Creator video submissions are not enabled on this server.')
    if (video && (!eventId || form.get('rightsConfirmed') !== 'true' || form.get('consentConfirmed') !== 'true'))
      throw errors.badRequest('Select an event and confirm your video rights and participant consent.')
    const ext = video ? videoExt : programme && file.type === 'application/pdf' ? 'pdf' : ALLOWED.get(file.type)
    if (!ext || (programme && ext !== 'pdf') || (!programme && ext === 'pdf')) throw errors.badRequest(programme ? 'Programme outlines must be PDF files.' : 'Only PNG, JPEG or WebP images are allowed.')
    const max = video ? MAX_PRIVATE_CLIP_BYTES : programme ? 10 * 1024 * 1024 : MAX_UPLOAD_BYTES
    if (file.size === 0 || file.size > max) throw errors.badRequest(`File must be between 1 byte and ${video ? '25MB' : programme ? '10MB' : '5MB'}.`)
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

    if (!orgId) throw errors.badRequest('Select an organization or an event to upload media.')
    if (video) {
      const validEvent=await db.event.findFirst({where:{
        id:eventId as string,orgId,deletedAt:null,status:{not:'CANCELLED'},
        org:{status:'ACTIVE',deletedAt:null},
      },select:{id:true}})
      if (!validEvent) throw errors.forbidden('Video submission requires an active organization and a valid event.')
      const pending=await db.mediaAsset.count({where:{orgId,kind:'CLIP',status:'PROCESSING'}})
      if (pending >= MAX_PENDING_CLIPS_PER_ORG) throw errors.badRequest('Video review queue is full. Please wait for your existing submissions to be reviewed.')
    }

    const { writeFile, mkdir, unlink } = await import('fs/promises')
    const buffer = Buffer.from(await file.arrayBuffer())
    const pdfHeader = buffer.length >= 9 && buffer.subarray(0, 5).toString('latin1') === '%PDF-' && buffer.subarray(-2048).toString('latin1').includes('%%EOF')
    if (programme ? !pdfHeader : video ? !hasVideoContainerSignature(buffer,file.type) : !isSupportedImage(buffer, file.type)) {
      throw errors.badRequest(programme ? 'The PDF file is invalid or incomplete.' : video ? 'A valid MP4/WebM container of at most 25MB is required.' : 'The uploaded image is empty, corrupt, too large, or does not match its declared image type.')
    }
    const name = `${randomUUID()}.${ext}`
    let filePath: string
    try {
      filePath = video ? privateVideoIntakePath(name) : programme ? join(mediaStorageDirectory(), name) : mediaFilePath(name)
      await mkdir(video ? privateVideoIntakeDirectory() : mediaStorageDirectory(), { recursive: true, mode: video ? 0o700 : 0o755 })
      await writeFile(filePath, buffer, { flag: 'wx', mode: video ? 0o600 : 0o644 })
    } catch {
      throw errors.unavailable('MEDIA_STORAGE_UNAVAILABLE', 'The upload could not be saved. Please try again or contact support.')
    }

    let asset
    try {
      asset = await db.mediaAsset.create({
        data: {
          orgId,
          eventId,
          uploaderId: user.id,
          kind,
          // Pending videos must NEVER be addressable by public /uploads routes.
          url: video ? `pending-video:${name}` : programme ? `programme:${name}` : `/uploads/${name}`,
          caption: sanitizeText(form.get('caption') ?? (programme ? file.name : ''), 200) || null,
          status: video ? 'PROCESSING' : 'READY',
        },
      })
    } catch (error) {
      await unlink(filePath).catch(() => {})
      throw error
    }
    // Withhold the private quarantine locator even from upload responses.
    if (video) return jsonOk({ asset: { id: asset.id, eventId, kind: 'CLIP', status: asset.status, caption: asset.caption } })
    return jsonOk({ asset: { ...asset, url: programme ? `/api/v1/events/${eventId}/programmes/${asset.id}` : asset.url } })
  })
}
