import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { db } from '../lib/db'
import { sessionToken } from './ids'

export const SESSION_COOKIE = 'ievx_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days
const ELEVATION_TTL_MS = 1000 * 60 * 10 // privileged re-auth valid 10 minutes

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hmacSign(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash)
  } catch {
    return false
  }
}

export interface AuthUser {
  id: string
  email: string
  displayName: string
  role: string
  avatarUrl: string | null
  phone: string | null
  country: string
  city: string | null
  timezone: string
  notifPrefs: Record<string, boolean>
  status: string
  elevated: boolean
}

export interface FullSession {
  user: AuthUser
  sessionId: string
}

export async function createSession(userId: string, ip?: string, userAgent?: string): Promise<{ token: string; expiresAt: Date }> {
  const token = sessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt, ip, userAgent },
  })
  return { token, expiresAt }
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function getSession(): Promise<FullSession | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  })
  if (!session) return null
  if (session.revokedAt || session.expiresAt < new Date()) return null
  if (session.user.status !== 'ACTIVE' || session.user.deletedAt) return null
  const elevated = Boolean(session.elevatedAt && Date.now() - session.elevatedAt.getTime() < ELEVATION_TTL_MS)
  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      role: session.user.role,
      avatarUrl: session.user.avatarUrl,
      phone: session.user.phone,
      country: session.user.country,
      city: session.user.city,
      timezone: session.user.timezone,
      notifPrefs: safeParsePrefs(session.user.notifPrefs),
      status: session.user.status,
      elevated,
    },
  }
}

function safeParsePrefs(raw: string): Record<string, boolean> {
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

export async function touchSession(sessionId: string) {
  await db.session.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } }).catch(() => {})
}

export async function elevateSession(sessionId: string) {
  await db.session.update({ where: { id: sessionId }, data: { elevatedAt: new Date() } }).catch(() => {})
}
