import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomInt } from 'node:crypto';
import type { z } from 'zod';
import { registerSchema, loginSchema, updateProfileSchema, notifPrefsSchema } from '@ieventplux/contracts';
import { loadEnv } from '@ieventplux/config';
import type { Prisma, User } from '@ieventplux/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { OutboxService } from '../../common/outbox.service.js';
import { AppError, badRequest, conflict } from '../../common/errors.js';
import { hashToken, newToken, SESSION_TTL_MS, type AuthContext } from '../../common/auth.js';

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const publicUser = (u: User) => ({ id: u.id, email: u.email, phone: u.phone, displayName: u.displayName, avatarUrl: u.avatarUrl, bio: u.bio, country: u.country, city: u.city, timezone: u.timezone, locale: u.locale, platformRole: u.platformRole, emailVerified: !!u.emailVerifiedAt, phoneVerified: !!u.phoneVerifiedAt, notifPrefs: u.notifPrefs, createdAt: u.createdAt });

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  async register(input: z.infer<typeof registerSchema>, meta: { ip?: string; userAgent?: string }) {
    const email = input.email.toLowerCase();
    if (await this.prisma.user.findFirst({ where: { OR: [{ email }, ...(input.phone ? [{ phone: input.phone }] : [])] } })) throw conflict('An account with that email or phone already exists');
    const passwordHash = await hash(input.password, ARGON);
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email, phone: input.phone ?? null, passwordHash, displayName: input.displayName, country: input.country, timezone: input.timezone, notifPrefs: notifPrefsSchema.parse({}) as Prisma.InputJsonValue } });
      await tx.consent.create({ data: { userId: u.id, channel: 'EMAIL', target: email, scope: 'TRANSACTIONAL', source: 'registration' } });
      if (input.phone) await tx.consent.create({ data: { userId: u.id, channel: 'SMS', target: input.phone, scope: 'TRANSACTIONAL', source: 'registration' } });
      await this.audit.log({ actorUserId: u.id, actorLabel: email, action: 'user.register', entityType: 'User', entityId: u.id, ip: meta.ip }, tx);
      return u;
    });
    const verification = await this.issueCode(user.id, 'EMAIL', email, 'VERIFY');
    const session = await this.createSession(user, meta);
    return { user, ...session, devCode: verification.devCode };
  }

  async login(input: z.infer<typeof loginSchema>, meta: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    const ok = user ? await verify(user.passwordHash, input.password).catch(() => false) : await verify('$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', input.password).catch(() => false);
    if (!user || !ok) throw new AppError('UNAUTHENTICATED', 'Incorrect email or password');
    if (user.status !== 'ACTIVE') throw new AppError('FORBIDDEN', 'This account is not active. Contact support.');
    await this.audit.log({ actorUserId: user.id, actorLabel: user.email, action: 'user.login', entityType: 'User', entityId: user.id, ip: meta.ip });
    return { user, ...(await this.createSession(user, meta)) };
  }

  private async createSession(user: User, meta: { ip?: string; userAgent?: string }) {
    const token = newToken(); const csrf = newToken();
    await this.prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(token), ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
    return { token, csrf };
  }

  async logout(auth: AuthContext) { await this.prisma.session.update({ where: { id: auth.sessionId }, data: { revokedAt: new Date() } }); }
  async logoutAll(auth: AuthContext) { await this.prisma.session.updateMany({ where: { userId: auth.user.id, revokedAt: null }, data: { revokedAt: new Date() } }); }
  async sessions(auth: AuthContext) { return this.prisma.session.findMany({ where: { userId: auth.user.id, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true }, orderBy: { lastSeenAt: 'desc' } }); }
  async revokeSession(auth: AuthContext, id: string) { await this.prisma.session.updateMany({ where: { id, userId: auth.user.id }, data: { revokedAt: new Date() } }); }

  async elevate(auth: AuthContext, password: string) {
    if (!(await verify(auth.user.passwordHash, password).catch(() => false))) throw new AppError('UNAUTHENTICATED', 'Incorrect password');
    const elevatedAt = new Date();
    await this.prisma.session.update({ where: { id: auth.sessionId }, data: { elevatedAt } });
    await this.audit.log({ actorUserId: auth.user.id, actorLabel: auth.user.email, action: 'session.elevate', entityType: 'Session', entityId: auth.sessionId });
    return { elevatedUntil: new Date(elevatedAt.getTime() + 10 * 60 * 1000) };
  }

  /** Issues a 6-digit code (hashed at rest, 15 min TTL) and enqueues delivery via the outbox. In development the code is also returned for local testing. */
  async issueCode(userId: string | null, channel: 'EMAIL' | 'SMS', target: string, purpose: 'VERIFY' | 'PASSWORD_RESET' | 'LOGIN_OTP') {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.$transaction(async (tx) => {
      await tx.contactVerification.updateMany({ where: { target, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
      await tx.contactVerification.create({ data: { userId, channel, target, purpose, codeHash: createHash('sha256').update(code).digest('hex'), expiresAt: new Date(Date.now() + 15 * 60 * 1000) } });
      await this.outbox.enqueue('SEND_MESSAGE', { kind: 'verification_code', channel, target, purpose, userId, templateVars: { code } }, {}, tx);
    });
    return { devCode: loadEnv().APP_ENV === 'development' ? code : undefined };
  }

  async requestVerification(auth: AuthContext, channel: 'EMAIL' | 'SMS') {
    const target = channel === 'EMAIL' ? auth.user.email : auth.user.phone;
    if (!target) throw badRequest('Add a phone number to your profile first');
    return this.issueCode(auth.user.id, channel, target, 'VERIFY');
  }

  async verifyContact(auth: AuthContext, channel: 'EMAIL' | 'SMS', code: string) {
    const target = channel === 'EMAIL' ? auth.user.email : auth.user.phone;
    if (!target) throw badRequest('No contact to verify');
    await this.consumeCode(target, 'VERIFY', code);
    await this.prisma.user.update({ where: { id: auth.user.id }, data: channel === 'EMAIL' ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() } });
    return { verified: true };
  }

  private async consumeCode(target: string, purpose: 'VERIFY' | 'PASSWORD_RESET' | 'LOGIN_OTP', code: string) {
    const record = await this.prisma.contactVerification.findFirst({ where: { target, purpose, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!record) throw badRequest('That code has expired. Request a new one.');
    if (record.attempts >= 5) throw badRequest('Too many attempts. Request a new code.');
    if (record.codeHash !== createHash('sha256').update(code).digest('hex')) { await this.prisma.contactVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } }); throw badRequest('Incorrect code'); }
    await this.prisma.contactVerification.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    return record;
  }

  async requestPasswordReset(target: { email?: string; phone?: string }) {
    const user = await this.prisma.user.findFirst({ where: target.email ? { email: target.email.toLowerCase() } : { phone: target.phone } });
    // Always respond identically to avoid account enumeration.
    if (!user) return { sent: true, target: target.email?.toLowerCase() ?? target.phone!, devCode: undefined as string | undefined };
    const channel = target.email ? 'EMAIL' : 'SMS'; const dest = target.email ? user.email : user.phone!;
    const { devCode } = await this.issueCode(user.id, channel, dest, 'PASSWORD_RESET');
    return { sent: true, target: dest, devCode };
  }

  async completePasswordReset(target: string, code: string, password: string) {
    const record = await this.consumeCode(target, 'PASSWORD_RESET', code);
    if (!record.userId) throw badRequest('Invalid reset request');
    const passwordHash = await hash(password, ARGON);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorUserId: record.userId, actorLabel: target, action: 'user.password_reset', entityType: 'User', entityId: record.userId });
    return { reset: true };
  }

  async updateProfile(auth: AuthContext, input: z.infer<typeof updateProfileSchema>) {
    return this.prisma.user.update({ where: { id: auth.user.id }, data: input });
  }
  async updateNotifPrefs(auth: AuthContext, prefs: z.infer<typeof notifPrefsSchema>) {
    const user = await this.prisma.user.update({ where: { id: auth.user.id }, data: { notifPrefs: prefs as Prisma.InputJsonValue } });
    for (const [channel, scope] of [['EMAIL', 'MARKETING'], ['SMS', 'MARKETING']] as const) {
      const target = channel === 'EMAIL' ? user.email : user.phone; if (!target) continue;
      if (prefs.marketing && (channel === 'EMAIL' ? prefs.email : prefs.sms)) await this.prisma.consent.upsert({ where: { target_channel_scope: { target, channel, scope } }, create: { userId: user.id, target, channel, scope, source: 'preferences' }, update: { revokedAt: null, source: 'preferences' } });
      else await this.prisma.consent.updateMany({ where: { target, channel, scope, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return user;
  }
  async deleteAccount(auth: AuthContext, password: string) {
    if (!(await verify(auth.user.passwordHash, password).catch(() => false))) throw new AppError('UNAUTHENTICATED', 'Incorrect password');
    const owned = await this.prisma.organization.count({ where: { ownerId: auth.user.id, deletedAt: null } });
    if (owned > 0) throw conflict('Transfer or close your organizations before deleting your account');
    const anon = `deleted-${auth.user.id}@deleted.ieventplux.invalid`;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: auth.user.id }, data: { status: 'DELETED', deletedAt: new Date(), email: anon, phone: null, displayName: 'Deleted user', avatarUrl: null, bio: null, passwordHash: 'deleted' } }),
      this.prisma.session.updateMany({ where: { userId: auth.user.id }, data: { revokedAt: new Date() } }),
      this.prisma.consent.updateMany({ where: { userId: auth.user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorUserId: null, actorLabel: 'self-service deletion', action: 'user.delete', entityType: 'User', entityId: auth.user.id });
  }
}
