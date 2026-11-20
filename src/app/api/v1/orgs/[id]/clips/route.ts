import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors } from '@/server/api'
import { db } from '@/lib/db'
import { membershipFor, orgCan } from '@/server/permissions'
import { videoUploadsEnabled, MAX_CLIP_UPLOAD_BYTES, MAX_PENDING_CLIPS_PER_ORG } from '@/server/video-upload-policy'

/**
 * Organizer-only clip publishing queue. Publishing is intentionally unavailable
 * until external content safety / encoding review is integrated and approved.
 * No public route exposes pending raw video files.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params
    const user = await requireUser()
    const membership = await membershipFor(user.id, id)
    if (!membership || !orgCan(membership.role, 'media:manage')) {
      throw errors.forbidden('Creator clips are restricted to organizer media managers.')
    }
    const [events, clips] = await Promise.all([
      db.event.findMany({
        where: { orgId: id, deletedAt: null, status: { not: 'CANCELLED' } },
        select: { id: true, title: true, status: true, visibility: true },
        orderBy: { startsAt: 'desc' },
        take: 80,
      }),
      db.mediaAsset.findMany({
        where: { orgId: id, kind: 'CLIP', eventId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, eventId: true, caption: true, url: true,
          status: true, createdAt: true,
          event: { select: { title: true, status: true, visibility: true } },
        },
        take: 50,
      }),
    ])
    const response = jsonOk({
      enabled: videoUploadsEnabled() && membership.orgStatus === 'ACTIVE',
      maxBytes: MAX_CLIP_UPLOAD_BYTES,
      maxPending: MAX_PENDING_CLIPS_PER_ORG,
      events, clips,
    })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  })
}
