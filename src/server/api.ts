import { NextRequest, NextResponse } from 'next/server'
import { getSession, type AuthUser } from './auth'
import { correlationId } from './ids'

/**
 * API helpers: stable error codes, correlation IDs, pagination and in-memory
 * rate limiting (documented limitation: single-instance; move to a shared store
 * when horizontally scaled — see docs/OPERATIONS.md).
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
      return NextResponse.json({ error: { code: err.code, message: err.message, ...err.extra } }, { status: err.status })
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

// ── Rate limiting (in-memory, per instance) ─────────────────────────────────

interface Bucket {
  count: number
  resetAt: number
}
const buckets = new Map<string, Bucket>()

export function rateLimit(req: NextRequest, scope: string, limit: number, windowMs: number) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  const key = `${scope}:${ip}`
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  bucket.count += 1
  if (bucket.count > limit) throw errors.rateLimited()
  // Opportunistic cleanup to keep memory bounded.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k)
  }
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
