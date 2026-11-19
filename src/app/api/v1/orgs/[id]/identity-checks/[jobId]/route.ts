import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { errors, handle, jsonOk, rateLimit, requireUser } from '@/server/api'
import { membershipFor, orgCan } from '@/server/permissions'
import { retrieveSmileDecision } from '@/server/identity-provider/smile'

type Context = { params: Promise<{ id: string; jobId: string }> }

/** Polls Smile ID server-to-server. Client claims are never accepted as results. */
export async function POST(req: NextRequest, ctx: Context) {
  return handle(async () => {
    await rateLimit(req, 'smile-id-job-refresh', 10, 60_000)
    const { id, jobId } = await ctx.params
    const user = await requireUser()
    const membership = await membershipFor(user.id, id)
    if (!membership || !orgCan(membership.role, 'org:manage')) throw errors.forbidden('Identity check status is restricted to organizer admins.')
    const job = await db.kycProviderJob.findFirst({ where: { id: jobId, orgId: id } })
    if (!job) throw errors.notFound('Verification job not found.')
    if (!job.externalJobId || job.state !== 'PROCESSING') return jsonOk({ job: { id: job.id, state: job.state } }, { headers: { 'Cache-Control': 'private, no-store' } })
    const checkedAt = job.lastCheckedAt?.getTime() ?? 0
    if (Date.now() - checkedAt < 30_000) throw errors.rateLimited('Wait at least 30 seconds before checking this provider job again.')
    // Claim the refresh window atomically so concurrent clients do not fan out to Smile ID.
    const claimed = await db.kycProviderJob.updateMany({ where: { id: job.id, state: 'PROCESSING', lastCheckedAt: job.lastCheckedAt }, data: { lastCheckedAt: new Date() } })
    if (claimed.count !== 1) throw errors.conflict('Another status check is running. Please refresh the page.')
    const decision = await retrieveSmileDecision(job.externalJobId)
    const final = await db.kycProviderJob.update({ where: { id: job.id }, data: { state: decision } })
    if (decision !== 'PROCESSING') {
      const { audit } = await import('@/server/audit')
      await audit({ actorUserId: user.id, actorLabel: user.email, action: 'org.kyc.provider_decision_received', entityType: 'KycProviderJob', entityId: job.id, after: { provider: 'SMILE_ID', result: decision } }).catch(() => {})
    }
    return jsonOk({ job: { id: final.id, state: final.state }, manualReviewRequired: true, autoApproval: false }, { headers: { 'Cache-Control': 'private, no-store' } })
  })
}
