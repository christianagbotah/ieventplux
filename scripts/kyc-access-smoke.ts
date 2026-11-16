/**
 * DEV-SEED-ONLY KYC API privacy regression.
 * Exercises actual HTTP permissions and synthetic ID-like pixels; never use
 * real identity records, no production writes, no payment provider calls.
 */
import sharp from 'sharp'
import { db } from '../src/lib/db'
import { deleteKycFile, privateDocumentPath } from '../src/server/kyc-storage'
import { access } from 'node:fs/promises'

if (process.env.NODE_ENV === 'production') throw new Error('Refusing KYC regression against production.')
const base = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '')
const password = 'Dev@12345'
function check(condition: unknown, message: string) {
  if (!condition) throw new Error('KYC REGRESSION FAILED: ' + message)
  console.log('PASS ' + message)
}
async function login(email: string): Promise<string> {
  const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  check(response.status === 200, 'seeded login for ' + email)
  const cookie = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie') ?? ''
  check(cookie.startsWith('ievx_session='), 'signed session cookie')
  return cookie.split(';')[0]
}
async function call(method: string, url: string, cookie?: string, body?: BodyInit) {
  return fetch(base + url, { method, headers: cookie ? { Cookie: cookie } : {}, body })
}
async function postJson(url: string, cookie: string, data: object) {
  return fetch(base + url, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
}
async function main() {
  const org = await db.organization.findUniqueOrThrow({ where: { slug: 'accra-events-co' } })
  const chapel = await db.organization.findUniqueOrThrow({ where: { slug: 'lightworld-chapel' } })
  const original = await db.organizerVerification.findUniqueOrThrow({ where: { orgId: org.id } })
  const [owner, member, unrelated, support, finance, admin] = await Promise.all([
    login('accra@eventco.dev'),
    login('media@lightworld.dev'),
    login('pastor@lightworld.dev'),
    login('support@ieventplux.dev'),
    login('finance@ieventplux.dev'),
    login('admin@ieventplux.dev'),
  ])
  let documentId: string | null = null
  try {
    check((await call('GET', '/orgs/' + org.id + '/kyc')).status === 401, 'anonymous users cannot list KYC')
    check((await call('GET', '/orgs/' + org.id + '/kyc', unrelated)).status === 403, 'unrelated organizer cannot list KYC')
    check((await call('GET', '/orgs/' + org.id + '/kyc', support)).status === 403, 'platform support cannot see KYC')
    check((await call('GET', '/orgs/' + chapel.id + '/kyc', member)).status === 403, 'event manager member cannot see KYC')
    check((await call('GET', '/orgs/' + org.id + '/kyc', finance)).status === 200, 'finance reviewer may view organization KYC')
    check((await call('GET', '/orgs/' + org.id + '/kyc', owner)).status === 200, 'organization owner may view own KYC')
    const statusResponse = await call('GET', '/orgs/' + chapel.id + '/verification', member)
    const status = await statusResponse.json()
    check(statusResponse.status === 200 && status.verification && !('evidence' in status.verification) && !('notes' in status.verification), 'non-admin member receives verification status but no private evidence or notes')
    check((await postJson('/orgs/' + chapel.id + '/verification-submit', member, { evidence: 'unauthorized override' })).status === 403, 'member cannot submit verification notes')
    check((await postJson('/orgs/' + chapel.id + '/verification-submit', unrelated, { evidence: 'override approved' })).status === 409, 'approved organization cannot be reset to pending')
    check((await postJson('/admin/orgs/' + org.id + '/verify', admin, { decision: 'APPROVE' })).status === 400, 'approval without reviewer attestation is rejected')
    check((await postJson('/admin/orgs/' + org.id + '/verify', admin, { decision: 'REJECT', notes: 'bad' })).status === 400, 'rejection requires actionable explanation')
    const adminResponse = await call('GET', '/admin/orgs', admin)
    const adminData = await adminResponse.json()
    const adminOrg = adminData.items?.find((item: { id: string }) => item.id === org.id)
    check(adminResponse.status === 200 && adminOrg?.verification && !('evidence' in adminOrg.verification), 'admin org list omits raw KYC evidence')
    const supportResponse = await call('GET', '/admin/orgs', support)
    const supportData = await supportResponse.json()
    const supportOrg = supportData.items?.find((item: { id: string }) => item.id === org.id)
    check(supportResponse.status === 200 && !('evidenceCount' in (supportOrg?.verification ?? {})), 'support role does not receive KYC counts')

    const image = await sharp({ create: { width: 420, height: 300, channels: 3, background: '#999999' } }).png().toBuffer()
    const upload = new FormData()
    upload.append('kind', 'GOVERNMENT_ID')
    upload.append('consent', 'yes')
    upload.append('file', new File([Uint8Array.from(image)], 'synthetic-test-identity.png', { type: 'image/png' }))
    const stored = await call('POST', '/orgs/' + org.id + '/kyc', owner, upload)
    const storedPayload = await stored.json()
    check(stored.status === 201 && Boolean(storedPayload.document?.id), 'owner can upload synthetic encrypted test image')
    documentId = storedPayload.document.id
    const documentUrl = '/orgs/' + org.id + '/kyc/' + documentId
    check((await call('GET', documentUrl)).status === 401, 'document download denies anonymous access')
    check((await call('GET', documentUrl, member)).status === 403, 'document download denies other team roles')
    check((await call('GET', documentUrl, support)).status === 403, 'document download denies support')
    const pdf = await call('GET', documentUrl, finance)
    check(pdf.status === 200 && pdf.headers.get('content-disposition')?.startsWith('attachment') && pdf.headers.get('cache-control')?.includes('no-store'), 'finance reviewer download is attachment-only and not cached')
    const uploadedList = await (await call('GET', '/orgs/' + org.id + '/kyc', owner)).json()
    check(uploadedList.documents.some((document: { id: string }) => document.id === documentId), 'owner sees new document metadata')
    check((await postJson('/admin/orgs/' + org.id + '/verify', admin, { decision: 'APPROVE', reviewerAttested: true })).status === 400, 'attestation alone cannot approve missing selfie and business registration')
    const deleted = await call('DELETE', documentUrl, owner)
    check(deleted.status === 200, 'owner can revoke incorrect identity upload before approval')
    check((await call('GET', documentUrl, owner)).status === 404, 'revoked document is no longer downloadable')
    let stillPresent = true
    try { await access(privateDocumentPath(org.id, documentId)) } catch { stillPresent = false }
    check(!stillPresent, 'encrypted test blob removed from active storage')
    documentId = null
  } finally {
    if (documentId) await deleteKycFile(org.id, documentId)
    // Restore the seed row exactly, irrespective of any test failures.
    await db.organizerVerification.update({ where: { orgId: org.id }, data: { evidence: original.evidence, status: original.status, notes: original.notes, submittedAt: original.submittedAt, reviewerId: original.reviewerId, decidedAt: original.decidedAt } })
    await db.organization.update({ where: { id: org.id }, data: { status: org.status, verifiedAt: org.verifiedAt } })
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
