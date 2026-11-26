import { randomUUID } from 'node:crypto'
import { db } from '../src/lib/db'
import { verificationEmailBody } from '../src/server/email-verification'

if (process.env.NODE_ENV === 'production' || process.env.IEVENTPLUX_ISOLATED_DB_TEST !== 'yes') throw new Error('Isolated development database required.')
const base = 'http://localhost:3000/api/v1'
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); console.log('PASS ' + message) }
const email = 'verify-' + randomUUID() + '@example.invalid'
async function post(action: string, body: object, cookie = '', ip = '192.0.2.40') {
  const response = await fetch(base + '/auth/' + action, {
    method: 'POST',
    headers: {'Content-Type':'application/json', Cookie:cookie, 'x-forwarded-for':ip},
    body: JSON.stringify(body),
  })
  return {response, data: await response.json()}
}
async function main() {
  const text = verificationEmailBody('https://example.invalid/', '123456')
  assert(text.includes('https://example.invalid/#/verify-email') && text.includes('123456') && !text.includes('verify-email?'), 'email includes direct route and separate code')
  const reg = await post('register', {email, password:'Synthetic-test-123!', displayName:'Synthetic verification'})
  assert(reg.response.ok && /^\d{6}$/.test(reg.data.devVerificationCode), 'registration creates dev-only code')
  const cookie = (reg.response.headers.get('set-cookie') ?? '').split(';')[0]
  assert(cookie.startsWith('ievx_session='), 'session created')
  const me = async () => fetch(base + '/auth/me', {headers:{Cookie:cookie}}).then(r=>r.json())
  assert((await me()).user.emailVerifiedAt === null, 'unverified account state exposed')
  assert((await post('verify-contact',{code:reg.data.devVerificationCode},'', '192.0.2.41')).response.status === 401, 'anonymous verification rejected')
  const resend = await post('resend-code', {}, cookie, '192.0.2.42')
  assert(resend.response.ok && resend.data.queued && /^\d{6}$/.test(resend.data.devVerificationCode), 'replacement code queued')
  const rows = await db.contactVerification.findMany({where:{target:email, purpose:'VERIFY'}})
  assert(rows.length === 2 && rows.filter(r=>r.consumedAt === null).length === 1, 'previous code invalidated')
  const code = resend.data.devVerificationCode as string
  const wrong = code === '111111' ? '222222' : '111111'
  for(let i=0;i<5;i++) assert((await post('verify-contact',{code:wrong},cookie,'192.0.2.43')).response.status === 400, 'wrong code rejected')
  assert((await post('verify-contact',{code},cookie,'192.0.2.43')).response.status === 429,'five failures exhaust code')
  const fresh = await post('resend-code', {}, cookie,'192.0.2.44')
  assert(fresh.response.ok, 'new code after exhausted attempts')
  assert((await post('verify-contact',{code:fresh.data.devVerificationCode},cookie,'192.0.2.45')).response.ok, 'correct code verifies account')
  assert(Boolean((await me()).user.emailVerifiedAt), 'persisted verified timestamp returned from session')
  const done = await post('resend-code',{},cookie,'192.0.2.44')
  assert(done.response.ok && done.data.alreadyVerified && !done.data.queued, 'verified account does not send another code')
  console.log('EMAIL_VERIFICATION_SMOKE_PASS')
}
main().finally(()=>db.$disconnect()).catch(err=>{console.error(err);process.exitCode=1})
