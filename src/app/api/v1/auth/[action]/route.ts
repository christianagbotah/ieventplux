import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, readJson, rateLimit, errors, jsonList } from '@/server/api'
import { db } from '@/lib/db'
import { createSession, setSessionCookie, hashPassword, verifyPassword, getSession, clearSessionCookie, touchSession, elevateSession, sha256 } from '@/server/auth'
import { otpCode } from '@/server/ids'
import { audit } from '@/server/audit'
import { queueMessage } from '@/server/services/notify'
import { env } from '@/server/env'
import { resolveSmtpConfig } from '@/server/communications-config'
import { verificationEmailBody } from '@/server/email-verification'

type RouteContext = { params: Promise<{ action: string }> }

export async function GET(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { action } = await ctx.params
    if (action === 'me') {
      const session = await getSession()
      if (!session) return jsonOk({ user: null })
      await touchSession(session.sessionId)
      const { membershipsOf } = await import('@/server/permissions')
      const memberships = await membershipsOf(session.user.id)
      return jsonOk({ user: session.user, memberships })
    }
    if (action === 'sessions') {
      const user = await requireUser()
      const sessions = await db.session.findMany({
        where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: 'desc' },
        take: 20,
      })
      return jsonList(
        sessions.map((s) => ({
          id: s.id,
          ip: s.ip,
          userAgent: s.userAgent,
          createdAt: s.createdAt,
          lastSeenAt: s.lastSeenAt,
          expiresAt: s.expiresAt,
          elevated: Boolean(s.elevatedAt && Date.now() - s.elevatedAt.getTime() < 10 * 60_000),
        })),
        sessions.length,
        1,
        50
      )
    }
    throw errors.notFound('Unknown auth endpoint.')
  })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return handle(async () => {
    const { action } = await ctx.params

    if (action === 'register') {
      await rateLimit(req, 'auth', 10, 60_000)
      const body = await readJson<{ email?: string; password?: string; displayName?: string; phone?: string; marketingSms?: boolean }>(req)
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      const displayName = String(body.displayName ?? '').trim()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw errors.badRequest('Enter a valid email address.')
      if (password.length < 8) throw errors.badRequest('Password must be at least 8 characters.')
      if (displayName.length < 2) throw errors.badRequest('Enter your full name.')
      const existing = await db.user.findFirst({ where: { OR: [{ email }, ...(body.phone ? [{ phone: String(body.phone).trim() }] : [])], deletedAt: null } })
      if (existing) throw errors.conflict('An account with this email or phone already exists. Try signing in.')
      // Do not leave a half-created account if verification or consent storage fails:
      // the account, code and marketing preference are committed atomically.
      const code = otpCode()
      const passwordHash = await hashPassword(password)
      const phone = body.phone ? String(body.phone).trim() : null
      let user: Awaited<ReturnType<typeof db.user.create>>
      try {
        user = await db.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              email,
              passwordHash,
              displayName,
              phone,
              notifPrefs: JSON.stringify({ email: true, sms: Boolean(phone), push: false, marketing: Boolean(body.marketingSms) }),
            },
          })
          await tx.contactVerification.create({
            data: { userId: created.id, channel: 'EMAIL', target: email, codeHash: sha256(code), purpose: 'VERIFY', expiresAt: new Date(Date.now() + 30 * 60_000) },
          })
          if (phone && body.marketingSms) {
            await tx.consent.upsert({
              where: { target_channel_scope: { target: phone, channel: 'SMS', scope: 'MARKETING' } },
              create: { userId: created.id, channel: 'SMS', target: phone, scope: 'MARKETING', source: 'signup' },
              update: { grantedAt: new Date(), revokedAt: null },
            })
          }
          return created
        })
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
          throw errors.conflict('An account with this email or phone already exists. Try signing in or resetting your password.')
        }
        throw error
      }
      // Verification delivery is not essential for creating an account. Keep the
      // real status honest when SMTP is disabled or the outbox cannot be queued.
      let verificationQueued = false
      try {
        await queueMessage({ channel: 'EMAIL', target: email, userId: user.id, template: 'verify_email', subject: 'Verify your iEventPlux account', body: verificationEmailBody(env.appUrl, code), purpose: 'TRANSACTIONAL' })
        verificationQueued = (await resolveSmtpConfig()).configured
      } catch (error) {
        console.error('[auth.register] could not queue verification email', error instanceof Error ? error.name : 'unknown error')
      }
      let devCode: string | null = null
      if (!env.isProd) devCode = code
      const { token, expiresAt } = await createSession(user.id, req.headers.get('x-forwarded-for') ?? undefined, req.headers.get('user-agent') ?? undefined)
      await setSessionCookie(token, expiresAt)
      await audit({ actorUserId: user.id, actorLabel: email, action: 'auth.register', entityType: 'User', entityId: user.id })
      return jsonOk({ user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role }, devVerificationCode: devCode, verificationEmailAvailable: verificationQueued, devNote: devCode ? 'DEV ONLY: verification code exposed because SMTP is not configured.' : null })
    }

    if (action === 'login') {
      await rateLimit(req, 'auth', 10, 60_000)
      const body = await readJson<{ email?: string; password?: string }>(req)
      const email = String(body.email ?? '').trim().toLowerCase()
      const user = await db.user.findUnique({ where: { email } })
      if (!user || user.deletedAt || user.status !== 'ACTIVE') throw errors.unauthorized('Invalid email or password.')
      const ok = await verifyPassword(String(body.password ?? ''), user.passwordHash)
      if (!ok) {
        await audit({ actorLabel: email, action: 'auth.login_failed', entityType: 'User', entityId: user.id, ip: req.headers.get('x-forwarded-for') })
        throw errors.unauthorized('Invalid email or password.')
      }
      const { token, expiresAt } = await createSession(user.id, req.headers.get('x-forwarded-for') ?? undefined, req.headers.get('user-agent') ?? undefined)
      await setSessionCookie(token, expiresAt)
      await audit({ actorUserId: user.id, actorLabel: email, action: 'auth.login', entityType: 'User', entityId: user.id })
      const { membershipsOf } = await import('@/server/permissions')
      return jsonOk({ user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, avatarUrl: user.avatarUrl, bannerUrl:user.bannerUrl, bio:user.bio, city:user.city, phone:user.phone, emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null }, memberships: await membershipsOf(user.id) })
    }

    if (action === 'logout') {
      const session = await getSession()
      if (session) {
        await db.session.update({ where: { id: session.sessionId }, data: { revokedAt: new Date() } })
      }
      await clearSessionCookie()
      return jsonOk({ ok: true })
    }

    if (action === 'elevate') {
      await rateLimit(req, 'elevate', 5, 60_000)
      const session = await getSession()
      if (!session) throw errors.unauthorized()
      const body = await readJson<{ password?: string }>(req)
      const user = await db.user.findUnique({ where: { id: session.user.id } })
      if (!user || !(await verifyPassword(String(body.password ?? ''), user.passwordHash))) throw errors.unauthorized('Incorrect password.')
      await elevateSession(session.sessionId)
      return jsonOk({ elevated: true })
    }

    if (action === 'verify-contact') {
      await rateLimit(req, 'verify', 10, 60_000)
      const user = await requireUser()
      const body = await readJson<{ channel?: string; code?: string }>(req)
      const channel = body.channel === 'SMS' ? 'SMS' : 'EMAIL'
      if (channel === 'EMAIL' && user.emailVerifiedAt) return jsonOk({ verified: true, channel })
      const target = channel === 'SMS' ? user.phone : user.email
      if (!target) throw errors.badRequest('No contact on file for that channel.')
      const record = await db.contactVerification.findFirst({
        where: { userId: user.id, channel, target, purpose: 'VERIFY', consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      })
      if (!record) throw errors.badRequest('No active verification code. Request a new one.')
      if (record.attempts >= 5) throw errors.rateLimited('Too many attempts. Request a new code.')
      const matches = record.codeHash === sha256(String(body.code ?? '').trim())
      const now = new Date()
      const claimed = await db.$transaction(async (tx) => {
        const result = await tx.contactVerification.updateMany({
          where: { id: record.id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: 5 } },
          data: { attempts: { increment: 1 }, ...(matches ? { consumedAt: now } : {}) },
        })
        if (matches && result.count === 1) {
          const updated = await tx.user.updateMany({
            where: { id: user.id, status: 'ACTIVE', deletedAt: null, ...(channel === 'SMS' ? { phone: target } : { email: target }) },
            data: channel === 'SMS' ? { phoneVerifiedAt: now } : { emailVerifiedAt: now },
          })
          if (updated.count !== 1) throw errors.conflict('Your contact changed. Request a new code.')
        }
        return result.count === 1
      })
      if (!claimed) throw errors.badRequest('This code is no longer active. Request a new one.')
      if (!matches) throw errors.badRequest('Incorrect code.')
      return jsonOk({ verified: true, channel })
    }

    if (action === 'resend-code') {
      await rateLimit(req, 'verify', 5, 60_000)
      const user = await requireUser()
      if (user.emailVerifiedAt) return jsonOk({ queued: false, alreadyVerified: true })
      if (env.isProd && !(await resolveSmtpConfig()).configured) throw errors.unavailable('EMAIL_UNAVAILABLE', 'Email delivery is currently unavailable. Please try again later or contact support.')
      const code = otpCode()
      await db.$transaction(async (tx) => {
        await tx.contactVerification.updateMany({ where: { userId: user.id, channel: 'EMAIL', purpose: 'VERIFY', consumedAt: null }, data: { consumedAt: new Date() } })
        await tx.contactVerification.create({ data: { userId: user.id, channel: 'EMAIL', target: user.email, codeHash: sha256(code), purpose: 'VERIFY', expiresAt: new Date(Date.now() + 30 * 60_000) } })
      })
      await queueMessage({ channel: 'EMAIL', target: user.email, userId: user.id, template: 'verify_email', subject: 'Your new iEventPlux code', body: verificationEmailBody(env.appUrl, code), purpose: 'TRANSACTIONAL' })
      return jsonOk({ queued: true, devVerificationCode: env.isProd ? null : code })
    }

    if (action === 'password-reset') {
      await rateLimit(req, 'pwreset', 5, 60_000)
      const body = await readJson<{ email?: string }>(req)
      const email = String(body.email ?? '').trim().toLowerCase()
      const user = await db.user.findUnique({ where: { email } })
      // Always respond ok (no account enumeration).
      if (user && user.status === 'ACTIVE' && !user.deletedAt) {
        const code = otpCode()
        await db.contactVerification.create({ data: { userId: user.id, channel: 'EMAIL', target: email, codeHash: sha256(code), purpose: 'PASSWORD_RESET', expiresAt: new Date(Date.now() + 30 * 60_000) } })
        await queueMessage({ channel: 'EMAIL', target: email, userId: user.id, template: 'password_reset', subject: 'Reset your iEventPlux password', body: `Your password reset code is ${code}. It expires in 30 minutes. If you did not request this, ignore this message.`, purpose: 'TRANSACTIONAL' })
        return jsonOk({ ok: true, devResetCode: env.isProd ? null : code, devNote: env.isProd ? null : 'DEV ONLY: reset code exposed because SMTP is not configured.' })
      }
      return jsonOk({ ok: true })
    }

    if (action === 'password-reset-confirm') {
      await rateLimit(req, 'pwreset', 10, 60_000)
      const body = await readJson<{ email?: string; code?: string; password?: string }>(req)
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      if (password.length < 8) throw errors.badRequest('Password must be at least 8 characters.')
      const record = await db.contactVerification.findFirst({
        where: { channel: 'EMAIL', target: email, purpose: 'PASSWORD_RESET', consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      })
      if (!record || record.codeHash !== sha256(String(body.code ?? '').trim())) throw errors.badRequest('Invalid or expired reset code.')
      const user = await db.user.findUnique({ where: { email } })
      if (!user) throw errors.badRequest('Invalid or expired reset code.')
      await db.contactVerification.update({ where: { id: record.id }, data: { consumedAt: new Date() } })
      await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } })
      // Session revocation: all sessions invalidated after a reset.
      await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
      await audit({ actorUserId: user.id, actorLabel: email, action: 'auth.password_reset', entityType: 'User', entityId: user.id })
      return jsonOk({ ok: true })
    }

    if (action === 'revoke-session') {
      const user = await requireUser()
      const body = await readJson<{ sessionId?: string }>(req)
      const target = await db.session.findUnique({ where: { id: String(body.sessionId ?? '') } })
      if (!target || target.userId !== user.id) throw errors.notFound('Session not found.')
      await db.session.update({ where: { id: target.id }, data: { revokedAt: new Date() } })
      return jsonOk({ ok: true })
    }

    if (action === 'revoke-all-sessions') {
      const user = await requireUser()
      await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
      await clearSessionCookie()
      return jsonOk({ ok: true })
    }

    if (action === 'profile') {
      const user = await requireUser()
      const body = await readJson<{ displayName?: string; phone?: string; city?: string; country?: string; timezone?: string; notifPrefs?: Record<string, boolean>; expectedUserId?:string; bio?: string }>(req)
      if(body.expectedUserId!==undefined&&body.expectedUserId!==user.id)throw errors.conflict('The signed-in account changed.')
      const data: Record<string, unknown> = {}
      if (body.displayName) data.displayName = String(body.displayName).slice(0, 80)
      if (body.bio !== undefined) data.bio = String(body.bio ?? '').slice(0, 300)
      if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).slice(0, 24) : null
      if (body.city !== undefined) data.city = String(body.city ?? '').slice(0, 60)
      if (body.country) data.country = String(body.country).slice(0, 2).toUpperCase()
      if (body.timezone) data.timezone = String(body.timezone).slice(0, 60)
      const patch=body.notifPrefs
      if(patch!==undefined&&(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.entries(patch).some(([k,v])=>!['email','sms','push','marketing'].includes(k)||typeof v!=='boolean')))throw errors.badRequest('Invalid notification preferences.')
      await db.$transaction(async tx=>{
        if(patch&&Object.keys(patch).length){
          const current=await tx.user.findUniqueOrThrow({where:{id:user.id},select:{notifPrefs:true}})
          let prior:Record<string,unknown>={}
          try{const parsed=JSON.parse(current.notifPrefs);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))prior=parsed}catch{}
          data.notifPrefs=JSON.stringify({...prior,...patch})
        }
        await tx.user.update({ where: { id: user.id }, data })
        if(patch?.push===false){
          await tx.pushInstallation.updateMany({where:{session:{userId:user.id},revokedAt:null},data:{revokedAt:new Date(),leaseUntil:null}})
        }
      },{isolationLevel:"Serializable"})
      return jsonOk({ ok: true })
    }

    throw errors.notFound('Unknown auth endpoint.')
  })
}
