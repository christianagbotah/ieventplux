import { NextRequest, NextResponse } from 'next/server'
import { getSession, type AuthUser } from './auth'
import { correlationId } from './ids'
import { db } from '@/lib/db'

/**
 * API helpers: stable error codes, correlation IDs, pagination and
 * DATABASE-BACKED rate limiting (R32: shared across every app instance —
 * horizontally-scaled deployments enforce one global budget per scope+IP).
 */

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public extra?: Record<string, unknown>
  ) {
    super(message)
  }
}

export const errors = {
  badRequest: (msg = 'Invalid request.') => new ApiError('BAD_REQUEST', msg, 400),
  unauthorized: (msg = 'Sign in required.') => new ApiError('UNAUTHORIZED', msg, 401),
  forbidden: (msg = 'You do not have permission to perform this action.') => new ApiError('FORBIDDEN', msg, 403),
  notFound: (msg = 'Resource not found.') => new ApiError('NOT_FOUND', msg, 404),
  conflict: (msg = 'Conflicting state.') => new ApiError('CONFLICT', msg, 409),
  rateLimited: (msg = 'Too many requests. Please slow down.') => new ApiError('RATE_LIMITED', msg, 429),
  unavailable: (code: string, msg: string) => new ApiError(code, msg, 503),
  internal: (msg = 'Unexpected server error.') => new ApiError('INTERNAL', msg, 500),
}

export interface PageParams {
  page: number
  pageSize: number
  offset: number
}

export function pagination(req: NextRequest, defaultSize = 12, maxSize = 50): PageParams {
  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const pageSize = Math.min(maxSize, Math.max(1, Number(url.searchParams.get('pageSize') ?? defaultSize) || defaultSize))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function jsonOk(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init)
  res.headers.set('X-Correlation-Id', correlationId())
  return res
}

export function jsonList<T>(items: T[], total: number, page: number, pageSize: number) {
  return jsonOk({ items, total, page, pageSize, hasMore: page * pageSize < total })
}

export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ApiError) {
      const res = NextResponse.json({ error: { code: err.code, message: err.message, ...err.extra } }, { status: err.status })
      // 429s carry the bucket's real window expiry so well-behaved clients back off.
      const retryAfter = (err.extra as { retryAfterSec?: number } | undefined)?.retryAfterSec
      if (err.status === 429 && typeof retryAfter === 'number') res.headers.set('Retry-After', String(Math.max(1, Math.ceil(retryAfter))))
      return res
    }
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('[api]', message, err)
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Unexpected server error.' } }, { status: 500 })
  }
}

export async function requireUser(): Promise<AuthUser> {
  const session = await getSession()
  if (!session) throw errors.unauthorized()
  return session.user
}

export async function requireSession(): Promise<{ user: AuthUser; sessionId: string }> {
  const session = await getSession()
  if (!session) throw errors.unauthorized()
  return { user: session.user, sessionId: session.sessionId }
}

export async function requirePlatformRole(permission: keyof typeof import('./permissions').PLATFORM_PERMISSIONS): Promise<AuthUser> {
  const user = await requireUser()
  const { platformCan } = await import('./permissions')
  if (!platformCan(user.role, permission)) throw errors.forbidden('Platform role required.')
  return user
}

/** Privileged financial actions require recent password re-authentication. */
export async function requireElevated(): Promise<AuthUser> {
  const session = await getSession()
  if (!session) throw errors.unauthorized()
  if (!session.user.elevated) {
    throw new ApiError('ELEVATION_REQUIRED', 'Re-enter your password to confirm this privileged action.', 401, {
      elevated: true,
    })
  }
  return session.user
}

export async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw errors.badRequest('A JSON request body is required.')
  }
}

// ── Rate limiting (database-backed: shared across instances) ────────────────
// R32 replaces the retired per-instance in-memory Map. Every protected route
// increments ONE durable bucket row per (scope, client IP) via an atomic
// UPSERT — two app processes behind one load balancer now enforce a single
// global budget (the previously documented single-instance limitation).
// Contract:
//  - PostgreSQL: single-statement INSERT … ON CONFLICT … RETURNING (atomic);
//  - SQLite deployments (single-writer WAL): transactional increment fallback;
//  - fail-open if the shared store is unreachable — availability beats blocking
//    (logged, throttled to once per minute);
//  - fixed windows; 429 responses carry Retry-After (see handle()).

interface RateLimitRow {
  count: number
}

let lastSweepAt = 0
let lastFailOpenLogAt = 0

function sweepExpiredBuckets(now: number) {
  if (now - lastSweepAt < 60_000) return
  lastSweepAt = now
  void db
    .$executeRaw`DELETE FROM "RateLimitBucket" WHERE "expiresAt" < ${BigInt(now)}`
    .catch(() => {
      // Non-fatal: the next sweep retries; expired rows only cost space.
    })
}

/** SQLite / fallback path: read-modify-write inside a transaction (serialized by
 *  SQLite's single-writer WAL mode; approximate under extreme concurrency —
 *  undercounting a burst by one is harmless for abuse protection). */
async function transactionalIncrement(key: string, windowStart: bigint, expiresAt: bigint): Promise<number> {
  return db.$transaction(async (tx) => {
    const existing = await tx.rateLimitBucket.findUnique({ where: { key_windowStart: { key, windowStart } } })
    if (!existing) {
      try {
        await tx.rateLimitBucket.create({ data: { key, windowStart, count: 1, expiresAt } })
        return 1
      } catch {
        // Lost a concurrent create race — fall through and increment the winner.
      }
    }
    const updated = await tx.rateLimitBucket.update({
      where: { key_windowStart: { key, windowStart } },
      data: { count: { increment: 1 } },
      select: { count: true },
    })
    return updated.count
  })
}

export async function rateLimit(req: NextRequest, scope: string, limit: number, windowMs: number) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  const key = `${scope}:${ip}`
  const now = Date.now()
  const windowStart = BigInt(Math.floor(now / windowMs) * windowMs)
  const expiresAt = windowStart + BigInt(windowMs)

  let count = 1
  try {
    const rows = await db.$queryRaw<RateLimitRow[]>`
      INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "expiresAt")
      VALUES (${key}, ${windowStart}, 1, ${expiresAt})
      ON CONFLICT ("key", "windowStart")
      DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
      RETURNING "count"`
    count = Number(rows[0]?.count ?? 1)
  } catch (err) {
    if (err instanceof ApiError) throw err
    try {
      count = await transactionalIncrement(key, windowStart, expiresAt)
    } catch {
      if (now - lastFailOpenLogAt > 60_000) {
        lastFailOpenLogAt = now
        console.warn('[rate-limit] shared store unreachable — failing open for scope', scope)
      }
      return // fail-open: never block traffic because the counter itself is down
    }
  }

  if (count > limit) {
    throw new ApiError('RATE_LIMITED', 'Too many requests. Please slow down.', 429, {
      retryAfterSec: Math.max(1, Math.ceil((Number(expiresAt) - now) / 1000)),
    })
  }
  sweepExpiredBuckets(now)
}

// ── Simple XSS-safe rendering of user HTML-free text ────────────────────────

export function sanitizeText(input: unknown, maxLength = 5000): string {
  if (typeof input !== 'string') return ''
  return input
    .slice(0, maxLength)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*on\w+\s*=[^>]*>/gi, (m) => m.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ''))
    .replace(/javascript:/gi, '')
    .trim()
}

export function parseTags(raw: unknown): string[] {
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr.filter((t) => typeof t === 'string').slice(0, 12) : []
    } catch {
      return raw.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12)
    }
  }
  if (Array.isArray(raw)) return raw.filter((t) => typeof t === 'string').slice(0, 12)
  return []
}
