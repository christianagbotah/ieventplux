import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ApiError, errors, handle, jsonOk, rateLimit, readJson, requireSession } from '@/server/api'
import { parsePushKey, parsePushRegistration } from '@/server/push-installation-policy'
import { optedIn,PUSH_DEVICE_LEASE_MS } from '@/server/push-delivery-policy'

const headers = { 'Cache-Control': 'private, no-store' }
const result = (registered: boolean, leaseUntil:Date|null=null) => jsonOk({ registered, leaseUntil, deliveryEnabled: false }, { headers })

/** Registry-only release. No provider call or claim of background delivery. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    await rateLimit(req, 'push-installation', 20, 60_000)
    const { user, sessionId } = await requireSession()
    const raw = await readJson<Record<string, unknown>>(req)
    if (typeof raw?.expectedUserId !== 'string' || raw.expectedUserId !== user.id) throw errors.conflict('The signed-in account changed. Reopen notification settings.')
    const data = parsePushRegistration(raw)
    if (!data) throw errors.badRequest('A valid device installation and notification permission are required.')
    const explicitConsent=raw.enableAccountPush===true
    const now=new Date(),leaseUntil=new Date(+now+PUSH_DEVICE_LEASE_MS)
    try {
      await db.$transaction(async tx => {
        const active = await tx.session.findFirst({ where: { id: sessionId, userId: user.id, revokedAt: null, expiresAt: { gt: new Date() }, user: { status: 'ACTIVE', deletedAt: null } }, select: { id: true,user:{select:{notifPrefs:true}} } })
        if (!active) throw errors.unauthorized()
        if(!optedIn(active.user.notifPrefs)){
          if(!explicitConsent)throw errors.forbidden('Enable account push notifications before registering this device.')
          let prefs:Record<string,unknown>={}
          try{const parsed=JSON.parse(active.user.notifPrefs);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))prefs=parsed}catch{}
          await tx.user.update({where:{id:user.id},data:{notifPrefs:JSON.stringify({...prefs,push:true})}})
          await tx.pushInstallation.updateMany({where:{session:{userId:user.id},revokedAt:null},data:{revokedAt:now,leaseUntil:null}})
        }
        const prior = await tx.pushInstallation.findUnique({ where: { keyHash: data.keyHash }, select: { sessionId: true, revokedAt: true, providerToken: true,leaseUntil:true } })
        if(prior&&(prior.revokedAt||prior.sessionId!==sessionId)&&!explicitConsent)throw errors.forbidden('Confirm phone notification consent again on this device.')
        if (!prior || prior.sessionId !== sessionId || prior.revokedAt || !prior.leaseUntil || prior.leaseUntil<=now) {
          const count = await tx.pushInstallation.count({ where: { sessionId, revokedAt: null,leaseUntil:{gt:now} } })
          if (count >= 5) throw errors.conflict('Too many registered devices for this session. Remove an existing installation.')
        }
        // Only the holder of the installation capability can rotate/rebind it.
        // The globally unique provider token cannot be claimed under a new key.
        await tx.pushInstallation.upsert({
          where: { keyHash: data.keyHash },
          create: { ...data, sessionId,leaseUntil },
          update: { sessionId, providerToken: data.providerToken, platform: data.platform, revokedAt: null,leaseUntil, ...(!prior || prior.sessionId !== sessionId || prior.revokedAt || prior.providerToken !== data.providerToken || !prior.leaseUntil || prior.leaseUntil<=now ? { activatedAt: now } : {}) },
        })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && ['P2002','P2034'].includes(String(err.code))) {
        throw errors.conflict('Device registration conflicted. Retry or reset this installation.')
      }
      // Prisma errors may embed token values: return a safe error without logging
      // raw database input through the generic exception handler.
      if (err instanceof ApiError) throw err
      throw errors.unavailable('DEVICE_REGISTRATION_UNAVAILABLE','Device registration is temporarily unavailable.')
    }
    return result(true,leaseUntil)
  })
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const { user, sessionId } = await requireSession()
    const body = await readJson<{ installationKey?: string; expectedUserId?: string }>(req)
    if (body?.expectedUserId !== user.id) throw errors.conflict('The signed-in account changed. Reopen notification settings.')
    const keyHash = parsePushKey(body?.installationKey)
    if (!keyHash) throw errors.badRequest('A valid device installation is required.')
    await db.pushInstallation.updateMany({ where: { keyHash, sessionId, revokedAt: null }, data: { revokedAt: new Date(),leaseUntil:null } })
    // Never expose whether another session owns the provided capability.
    return result(false)
  })
}
