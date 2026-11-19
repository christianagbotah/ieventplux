import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { errors, handle, jsonOk, rateLimit, requireUser } from '@/server/api'
import { membershipFor, orgCan } from '@/server/permissions'
import { smileProviderStatus, submitSmileDocumentCheck } from '@/server/identity-provider/smile'
import { validateIdentityNames, validateLivenessFiles, verifiedImage } from '@/server/identity-provider/capture'

type Context = { params: Promise<{ id: string }> }
async function authorized(id: string) {
  const user = await requireUser()
  const membership = await membershipFor(user.id, id)
  if (!membership || !orgCan(membership.role, 'org:manage')) throw errors.forbidden('Only organization owners or admins can access automated identity checks.')
  return user
}

/** Status is always honest when Smile ID is not configured or activated. */
export async function GET(req: NextRequest, ctx: Context) {
  return handle(async () => {
    void req
    const { id } = await ctx.params
    await authorized(id)
    const [jobs, org] = await Promise.all([
      db.kycProviderJob.findMany({ where: { orgId: id }, orderBy: { createdAt: 'desc' }, take: 8,
        select: { id: true, provider: true, state: true, createdAt: true, updatedAt: true, lastCheckedAt: true } }),
      db.organization.findUnique({ where: { id }, select: { id: true, status: true } }),
    ])
    if (!org || org.status === 'SUSPENDED') throw errors.notFound('Organization unavailable.')
    return jsonOk({ provider: smileProviderStatus(), jobs, manualReviewAvailable: true, autoApproval: false }, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}

/** Optional Smile ID V3 document/liveness job; no provider credentials -> no submission.
 * The client must supply fresh guided captures (one selfie, SDK-generated liveness frames,
 * front and optional back) and explicitly consent to third-party processing.
 * This route does not upload previously stored manual-review evidence to Smile ID.
 */
export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    await rateLimit(req, 'smile-id-document-check', 3, 60 * 60_000)
    const { id } = await ctx.params
    const user = await authorized(id)
    const config = smileProviderStatus()
    if (!config.ready || !config.noticeUrl) throw errors.unavailable('IDENTITY_PROVIDER_UNAVAILABLE', 'Automated identity verification is not activated. Continue with secure document upload for manual review.')
    const org = await db.organization.findUnique({ where: { id }, select: { status: true, country: true, verification: { select: { status: true } } } })
    if (!org || org.status === 'SUSPENDED') throw errors.notFound('Organization unavailable.')
    if (org.verification?.status === 'APPROVED') throw errors.conflict('This organizer is already verified. Contact platform support if re-verification is needed.')
    const active = await db.kycProviderJob.findFirst({ where: { orgId: id, state: { in: ['SUBMITTING', 'PROCESSING'] } } })
    if (active) throw errors.conflict('An identity check is already in progress. Refresh its status before trying again.')
    const declaredSize = Number(req.headers.get('content-length') || 0)
    if (declaredSize > 32 * 1024 * 1024) throw errors.badRequest('The verification images are too large. Retake them in the guided camera.')
    const form = await req.formData().catch(() => null)
    if (!form) throw errors.badRequest('Submit the camera capture form.')
    if (form.get('biometricConsent') !== 'yes') throw errors.badRequest('Explicit consent to Smile ID biometric and identity-document processing is required.')
    const legalName = validateIdentityNames(form)
    const liveness = form.getAll('livenessImages')
    validateLivenessFiles(liveness)
    const [selfieImage, document, documentBack, ...livenessImages] = await Promise.all([
      verifiedImage(form.get('selfieImage'), 'selfie'),
      verifiedImage(form.get('document'), 'front of identity document'),
      form.get('documentBack') ? verifiedImage(form.get('documentBack'), 'back of identity document') : Promise.resolve(null),
      ...liveness.map((file, i) => verifiedImage(file, `liveness frame ${i + 1}`)),
    ])
    const consentAt = new Date()
    let job: { id: string }
    try {
      job = await db.kycProviderJob.create({ data: {
        orgId: id, userId: user.id, state: 'SUBMITTING', consentAt, noticeUrl: config.noticeUrl, country: org.country,
      } })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw errors.conflict('Another identity check is already active for this organizer.')
      }
      throw error
    }
    try {
      const externalJobId = await submitSmileDocumentCheck({
        country: org.country, userId: user.id,
        userDetails: { ...legalName, email: user.email },
        selfieImage, document, ...(documentBack ? { documentBack } : {}), livenessImages,
        grantedAt: consentAt, noticeUrl: config.noticeUrl,
      })
      await db.kycProviderJob.update({ where: { id: job.id }, data: { externalJobId, state: 'PROCESSING' } })
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'org.kyc.provider_submitted', entityType: 'KycProviderJob', entityId: job.id, after: { provider: 'SMILE_ID' } }).catch(() => {})
      return jsonOk({ job: { id: job.id, state: 'PROCESSING' }, note: 'Smile ID accepted the request. This is not an identity approval; check the result when available.' }, { status: 202, headers: { 'Cache-Control': 'private, no-store' } })
    } catch (error) {
      await db.kycProviderJob.update({ where: { id: job.id }, data: { state: 'ERROR', decisionNote: 'Provider submission did not complete.' } }).catch(() => {})
      throw error
    }
  })
}
