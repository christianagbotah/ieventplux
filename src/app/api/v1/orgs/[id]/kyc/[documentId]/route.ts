import { NextRequest, NextResponse } from 'next/server'
import { unlink } from 'fs/promises'
import { handle, requireUser, errors, jsonOk, rateLimit } from '@/server/api'
import { membershipFor, orgCan, platformCan } from '@/server/permissions'
import { db } from '@/lib/db'
import { parseEvidence, readEncryptedKyc, privateDocumentPath, type KycDocument } from '@/server/kyc-storage'

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


/** Revoke a mistakenly uploaded private document before verification approval.
 * This also removes the encrypted blob from active storage. Encrypted historical
 * backups expire on the operator's retention schedule (currently 14 days).
 */
export async function DELETE(req: NextRequest, ctx: Context) {
  return handle(async () => {
    await rateLimit(req, 'kyc-document-delete', 12, 60_000)
    const { id, documentId } = await ctx.params
    const user = await requireUser()
    const membership = await membershipFor(user.id, id)
    if (!membership || !orgCan(membership.role, 'org:manage')) {
      throw errors.forbidden('Only organization owners and admins may remove verification documents.')
    }
    let removed: KycDocument | undefined
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await db.organizerVerification.findUnique({ where: { orgId: id }, select: { evidence: true, status: true } })
      if (!row) throw errors.notFound('Verification case not found.')
      if (row.status === 'APPROVED') throw errors.conflict('Approved verification documents cannot be removed. Contact platform support.')
      const records = parseEvidence(row.evidence)
      const doc = records.find((entry): entry is KycDocument => entry.type === 'kyc' && entry.id === documentId)
      if (!doc) throw errors.notFound('Verification document not found.')
      const result = await db.organizerVerification.updateMany({
        where: { orgId: id, status: { not: 'APPROVED' }, evidence: row.evidence },
        data: { evidence: JSON.stringify(records.filter((entry) => !(entry.type === 'kyc' && entry.id === documentId))) },
      })
      if (result.count === 1) { removed = doc; break }
    }
    if (!removed) throw errors.conflict('Verification documents changed. Refresh and retry.')
    try {
      await unlink(privateDocumentPath(id, documentId))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // The DB pointer has been removed, so the file is not downloadable
        // even if deletion fails. Raise an operator alert for residual bytes.
        console.error('[kyc] orphaned encrypted document requires operator cleanup', { id, documentId, error })
      }
    }
    const { audit } = await import('@/server/audit')
    await audit({ actorUserId: user.id, actorLabel: user.email, action: 'org.kyc.document_remove', entityType: 'Organization', entityId: id, after: { documentId, kind: removed.kind } })
    return jsonOk({ removed: true, documentId, note: 'Removed from active verification records. Protected backup copies expire on the configured retention schedule.' }, { headers: { 'Cache-Control': 'no-store' } })
  })
}
