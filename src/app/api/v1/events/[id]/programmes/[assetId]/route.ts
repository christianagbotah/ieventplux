import { NextRequest, NextResponse } from 'next/server'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { handle, jsonOk, requireUser, errors } from '@/server/api'
import { eventOrgAccess } from '@/server/permissions'
import { canViewProgramme } from '@/server/event-operations-access'
import { mediaStorageDirectory } from '@/server/media-storage'
import { db } from '@/lib/db'

type Context = { params: Promise<{ id: string; assetId: string }> }
const NAME = /^programme:([a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}\.pdf)$/i

/** PDF programmes are intentionally NOT exposed through /uploads public static
 * image routes. Invitation-only event programmes require approved access. */
export async function GET(_req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id, assetId } = await ctx.params
    await canViewProgramme(id)
    const doc = await db.mediaAsset.findFirst({ where: { id: assetId, eventId: id, kind: 'PROGRAMME', status: 'READY' }, select: { url: true, caption: true } })
    const name = doc?.url.match(NAME)?.[1]
    if (!name) throw errors.notFound('Programme file not found.')
    let bytes: Buffer
    try {
      bytes = await readFile(join(mediaStorageDirectory(), name))
      if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw Error('Invalid PDF')
    } catch { throw errors.notFound('Programme file is unavailable.') }
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="event-programme-${assetId.slice(0, 8)}.pdf"`,
        'Content-Length': String(bytes.length),
        'Content-Security-Policy': 'sandbox',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  })
}

export async function DELETE(_req: NextRequest, ctx: Context) {
  return handle(async () => {
    const { id, assetId } = await ctx.params
    const user = await requireUser()
    const access = await eventOrgAccess(user.id, id, 'media:manage')
    if (!access.allowed) throw errors.forbidden('Programme management requires organizer permission.')
    const result = await db.mediaAsset.updateMany({ where: { id: assetId, eventId: id, kind: 'PROGRAMME' }, data: { status: 'ARCHIVED' } })
    if (!result.count) throw errors.notFound('Programme file not found.')
    return jsonOk({ archived: true })
  })
}
