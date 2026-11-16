import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors, rateLimit } from '@/server/api'
import { membershipFor, orgCan, platformCan } from '@/server/permissions'
import { db } from '@/lib/db'
import { newDocumentId, parseEvidence, prepareKycFile, saveEncryptedKyc, deleteKycFile, kycMetadata, safeFileLabel, validKycKind, type KycDocument } from '@/server/kyc-storage'

type Context = { params: Promise<{ id: string }> }
async function allowed(user: { id: string; role: string }, orgId: string, upload: boolean) {
  const membership = await membershipFor(user.id, orgId)
  const owner = Boolean(membership && orgCan(membership.role, 'org:manage'))
  if (upload ? !owner : !(owner || platformCan(user.role, 'admin:finance'))) {
    throw errors.forbidden('Only the organization owner/admin or an authorized verification reviewer can access these records.')
  }
}
export async function GET(req: NextRequest, ctx: Context) {
  return handle(async () => {
    void req
    const { id } = await ctx.params
    const user = await requireUser()
    await allowed(user, id, false)
    const verification = await db.organizerVerification.findUnique({ where: { orgId: id }, select: { evidence: true, status: true, notes: true } })
    if (!verification) throw errors.notFound('Verification case not found.')
    const documents = parseEvidence(verification.evidence).filter((r): r is KycDocument => r.type === 'kyc')
    return jsonOk({ documents: documents.map(kycMetadata), status: verification.status, reviewNote: verification.notes }, { headers: { 'Cache-Control': 'no-store' } })
  })
}
export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    await rateLimit(req, 'kyc-document-upload', 12, 60_000)
    const { id } = await ctx.params
    const user = await requireUser()
    await allowed(user, id, true)
    const form = await req.formData().catch(() => null)
    if (!form) throw errors.badRequest('Multipart document upload required.')
    if (form.get('consent') !== 'yes') throw errors.badRequest('Confirm your consent to secure identity verification.')
    const kind = validKycKind(form.get('kind'))
    const file = form.get('file')
    if (!(file instanceof File)) throw errors.badRequest('Select a document or selfie image.')
    const v = await db.organizerVerification.findUnique({ where: { orgId: id } })
    if (!v) throw errors.notFound('Verification case not found.')
    if (v.status === 'APPROVED') throw errors.conflict('This organization is already verified. Contact platform support to request a new verification review.')
    const previous = parseEvidence(v.evidence)
    if (previous.filter((e) => e.type === 'kyc').length >= 10) throw errors.badRequest('Maximum 10 verification documents reached.')
    const safe = await prepareKycFile(file, kind)
    const docId = newDocumentId()
    const document: KycDocument = {
      id: docId, type: 'kyc', kind,
      filename: safeFileLabel(file.name),
      mime: safe.mime, size: safe.buffer.length,
      uploadedAt: new Date().toISOString(), uploadedBy: user.id,
    }
    await saveEncryptedKyc(id, docId, safe.buffer)
    try {
      await db.organizerVerification.update({
        where: { orgId: id },
        data: { evidence: JSON.stringify([...previous, document]), submittedAt: new Date(), status: 'PENDING', notes: null },
      })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'org.kyc.document_upload', entityType: 'Organization', entityId: id, after: { documentId: docId, kind, bytes: document.size } }).catch((err) => { console.error('[kyc] failed to audit upload', err) })
    } catch (error) {
      await deleteKycFile(id, docId)
      throw error
    }
    return jsonOk({ document: kycMetadata(document), note: 'Document stored privately for manual review. Upload does not itself confirm identity.' }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  })
}
