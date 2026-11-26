import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ApiError, errors, handle, jsonOk, rateLimit, readJson, requireSession } from '@/server/api'
import { parsePushKey, parsePushRegistration } from '@/server/push-installation-policy'

const headers = { 'Cache-Control': 'private, no-store' }
const result = (registered: boolean) => jsonOk({ registered, deliveryEnabled: false }, { headers })

/** Registry-only release. No provider call or claim of background delivery. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    await rateLimit(req, 'push-installation', 20, 60_000)
    const { user, sessionId } = await requireSession()
    const raw = await readJson<Record<string, unknown>>(req)
    if (typeof raw?.expectedUserId !== 'string' || raw.expectedUserId !== user.id) throw errors.conflict('The signed-in account changed. Reopen notification settings.')
    const data = parsePushRegistration(raw)
    if (!data) throw errors.badRequest('A valid device installation and notification permission are required.')
    if (user.notifPrefs.push === false) throw errors.forbidden('Push notifications are disabled in your preferences.')
    try {
      await db.$transaction(async tx => {
        const active = await tx.session.findFirst({ where: { id: sessionId, userId: user.id, revokedAt: null, expiresAt: { gt: new Date() }, user: { status: 'ACTIVE', deletedAt: null } }, select: { id: true } })
        if (!active) throw errors.unauthorized()
        const prior = await tx.pushInstallation.findUnique({ where: { keyHash: data.keyHash }, select: { sessionId: true, revokedAt: true } })
        if (!prior || prior.sessionId !== sessionId || prior.revokedAt) {
          const count = await tx.pushInstallation.count({ where: { sessionId, revokedAt: null } })
          if (count >= 5) throw errors.conflict('Too many registered devices for this session. Remove an existing installation.')
        }
        // Only the holder of the installation capability can rotate/rebind it.
        // The globally unique provider token cannot be claimed under a new key.
        await tx.pushInstallation.upsert({
          where: { keyHash: data.keyHash },
          create: { ...data, sessionId },
          update: { sessionId, providerToken: data.providerToken, platform: data.platform, revokedAt: null },
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
    return result(true)
  })
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const { user, sessionId } = await requireSession()
    const body = await readJson<{ installationKey?: string; expectedUserId?: string }>(req)
    if (body?.expectedUserId !== user.id) throw errors.conflict('The signed-in account changed. Reopen notification settings.')
    const keyHash = parsePushKey(body?.installationKey)
    if (!keyHash) throw errors.badRequest('A valid device installation is required.')
    await db.pushInstallation.updateMany({ where: { keyHash, sessionId, revokedAt: null }, data: { revokedAt: new Date() } })
    // Never expose whether another session owns the provided capability.
    return result(false)
  })
}
