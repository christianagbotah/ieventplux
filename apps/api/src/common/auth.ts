import { CanActivate, ExecutionContext, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PlatformRole, User } from '@ieventplux/db';
import { loadEnv } from '@ieventplux/config';
import { PrismaService } from './prisma.service.js';
import { AppError } from './errors.js';

export const SESSION_COOKIE = 'ieventplux_session';
export const CSRF_COOKIE = 'ieventplux_csrf';
export const CSRF_HEADER = 'x-csrf-token';
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
export const ELEVATION_TTL_MS = 10 * 60 * 1000;

export interface AuthContext { user: User; sessionId: string; elevatedAt: Date | null; client: 'cookie' | 'bearer' }
export type AuthedRequest = Request & { auth?: AuthContext; id?: string };

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.auth) throw new AppError('UNAUTHENTICATED', 'Please sign in');
  return req.auth;
});
export const OptionalAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext | undefined => ctx.switchToHttp().getRequest<AuthedRequest>().auth);

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export function isElevated(auth: AuthContext) { return !!auth.elevatedAt && Date.now() - auth.elevatedAt.getTime() < ELEVATION_TTL_MS; }
export function requireElevation(auth: AuthContext) { if (!isElevated(auth)) throw new AppError('ELEVATION_REQUIRED', 'Please confirm your password to continue'); }
export function hasPlatformRole(user: User, roles: PlatformRole[]) { return roles.includes(user.platformRole); }

export function setSessionCookies(res: Response, token: string, csrf: string) {
  const env = loadEnv(); const secure = env.APP_ENV !== 'development';
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_TTL_MS });
  res.cookie(CSRF_COOKIE, csrf, { httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge: SESSION_TTL_MS });
}
export function clearSessionCookies(res: Response) { res.clearCookie(SESSION_COOKIE, { path: '/' }); res.clearCookie(CSRF_COOKIE, { path: '/' }); }

/** Global guard: resolves the session (cookie or bearer), enforces CSRF double-submit for cookie clients on unsafe methods. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const token = bearer ?? cookieToken;
    if (token) {
      const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
      if (session && !session.revokedAt && session.expiresAt > new Date() && session.user.status === 'ACTIVE') {
        const client = bearer ? 'bearer' : 'cookie';
        if (client === 'cookie' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
          const header = req.headers[CSRF_HEADER]?.toString() ?? ''; const cookie = (req.cookies as Record<string, string>)[CSRF_COOKIE] ?? '';
          if (!header || header.length !== cookie.length || !timingSafeEqual(Buffer.from(header), Buffer.from(cookie))) throw new AppError('CSRF_FAILED', 'Security check failed; please reload and try again');
        }
        req.auth = { user: session.user, sessionId: session.id, elevatedAt: session.elevatedAt, client };
        if (Date.now() - session.lastSeenAt.getTime() > 60_000) void this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
      }
    }
    if (isPublic || req.auth) return true;
    throw new AppError('UNAUTHENTICATED', 'Please sign in');
  }
}
