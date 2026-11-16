import { NextRequest, NextResponse } from 'next/server'
import { handle, requireUser, errors } from '@/server/api'
import { membershipFor, orgCan, platformCan } from '@/server/permissions'
import { db } from '@/lib/db'
import { parseEvidence, readEncryptedKyc, type KycDocument } from '@/server/kyc-storage'

type Context = { params: Promise<{ id: string; documentId: string }> }
export async function GET(req: NextRequest, ctx: Context) {
  return handle(async () => {
    void req
    const { id, documentId } = await ctx.params
    const user = await requireUser()
    const membership = await membershipFor(user.id, id)
    const owner = Boolean(membership && orgCan(membership.role, 'org:manage'))
    if (!owner && !platformCan(user.role, 'admin:finance')) throw errors.forbidden('Verification document access restricted.')
    const row = await db.organizerVerification.findUnique({ where: { orgId: id }, select: { evidence: true } })
    if (!row) throw errors.notFound('Document unavailable.')
    const doc = parseEvidence(row.evidence).find((d): d is KycDocument => d.type === 'kyc' && d.id === documentId)
    if (!doc) throw errors.notFound('Document unavailable.')
    let plaintext: Buffer
    try { plaintext = await readEncryptedKyc(id, documentId) }
    catch { throw errors.notFound('Document unavailable.') }
    const ext = doc.mime === 'application/pdf' ? 'pdf' : 'webp'
    const response = new NextResponse(new Uint8Array(plaintext), {
      headers: {
        'Content-Type': doc.mime,
        'Content-Disposition': 'attachment; filename="kyc-' + documentId + '.' + ext + '"',
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
    const { audit } = await import('@/server/audit')
    await audit({ actorUserId: user.id, actorLabel: user.email, action: 'org.kyc.document_download', entityType: 'Organization', entityId: id, after: { documentId } })
    return response
  })
}
