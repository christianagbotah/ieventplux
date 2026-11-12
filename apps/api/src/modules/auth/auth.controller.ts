import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { registerSchema, loginSchema, elevateSchema, requestResetSchema, completeResetSchema, verifyContactSchema, updateProfileSchema, notifPrefsSchema } from '@ieventplux/contracts';
import { Auth, Public, clearSessionCookies, newToken, setSessionCookies, type AuthContext, isElevated, CSRF_COOKIE } from '../../common/auth.js';
import { Z } from '../../common/zod.pipe.js';
import { RedisService } from '../../common/redis.service.js';
import { AppError } from '../../common/errors.js';
import { AuthService, publicUser } from './auth.service.js';
import { loadEnv } from '@ieventplux/config';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly redis: RedisService) {}
  private async limit(req: Request, bucket: string, limit: number, windowSec: number) {
    if (!(await this.redis.allow(`${bucket}:${req.ip}`, limit, windowSec))) throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait a minute and try again.');
  }
  private issue(res: Response, client: 'web' | 'mobile', token: string, csrf: string) {
    if (client === 'mobile') return { token };
    setSessionCookies(res, token, csrf); return { csrf };
  }

  @Public() @Post('register')
  async register(@Body(Z(registerSchema.extend({ client: z.enum(['web', 'mobile']).default('web') }))) body: z.infer<typeof registerSchema> & { client: 'web' | 'mobile' }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.limit(req, 'register', 10, 600);
    const r = await this.auth.register(body, meta(req));
    return { user: publicUser(r.user), ...this.issue(res, body.client, r.token, r.csrf), devCode: r.devCode };
  }
  @Public() @Post('login') @HttpCode(200)
  async login(@Body(Z(loginSchema)) body: z.infer<typeof loginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.limit(req, 'login', 20, 300);
    const r = await this.auth.login(body, meta(req));
    return { user: publicUser(r.user), ...this.issue(res, body.client, r.token, r.csrf) };
  }
  @Post('logout') @HttpCode(200)
  async logout(@Auth() auth: AuthContext, @Res({ passthrough: true }) res: Response) { await this.auth.logout(auth); clearSessionCookies(res); return { ok: true }; }
  @Post('logout-all') @HttpCode(200)
  async logoutAll(@Auth() auth: AuthContext, @Res({ passthrough: true }) res: Response) { await this.auth.logoutAll(auth); clearSessionCookies(res); return { ok: true }; }
  @Get('me')
  me(@Auth() auth: AuthContext) { return { user: publicUser(auth.user), elevated: isElevated(auth) }; }
  @Public() @Get('csrf')
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const existing = (req.cookies as Record<string, string>)[CSRF_COOKIE]; const csrf = existing ?? newToken();
    if (!existing) res.cookie(CSRF_COOKIE, csrf, { httpOnly: false, sameSite: 'lax', secure: loadEnv().APP_ENV !== 'development', path: '/' });
    return { csrf };
  }
  @Get('sessions') sessions(@Auth() auth: AuthContext) { return this.auth.sessions(auth); }
  @Delete('sessions/:id') async revoke(@Auth() auth: AuthContext, @Param('id') id: string) { await this.auth.revokeSession(auth, id); return { ok: true }; }
  @Post('elevate') @HttpCode(200)
  async elevate(@Auth() auth: AuthContext, @Body(Z(elevateSchema)) body: z.infer<typeof elevateSchema>, @Req() req: Request) { await this.limit(req, 'elevate', 10, 300); return this.auth.elevate(auth, body.password); }
  @Post('verification/request') @HttpCode(200)
  requestVerification(@Auth() auth: AuthContext, @Body(Z(z.object({ channel: z.enum(['EMAIL', 'SMS']) }))) body: { channel: 'EMAIL' | 'SMS' }) { return this.auth.requestVerification(auth, body.channel); }
  @Post('verification/confirm') @HttpCode(200)
  verify(@Auth() auth: AuthContext, @Body(Z(verifyContactSchema)) body: z.infer<typeof verifyContactSchema>) { return this.auth.verifyContact(auth, body.channel, body.code); }
  @Public() @Post('password/forgot') @HttpCode(200)
  async forgot(@Body(Z(requestResetSchema)) body: z.infer<typeof requestResetSchema>, @Req() req: Request) { await this.limit(req, 'forgot', 5, 600); return this.auth.requestPasswordReset(body); }
  @Public() @Post('password/reset') @HttpCode(200)
  async reset(@Body(Z(completeResetSchema)) body: z.infer<typeof completeResetSchema>, @Req() req: Request) { await this.limit(req, 'reset', 10, 600); return this.auth.completePasswordReset(body.target, body.code, body.password); }
  @Put('profile') async profile(@Auth() auth: AuthContext, @Body(Z(updateProfileSchema)) body: z.infer<typeof updateProfileSchema>) { return { user: publicUser(await this.auth.updateProfile(auth, body)) }; }
  @Put('notification-preferences') async prefs(@Auth() auth: AuthContext, @Body(Z(notifPrefsSchema)) body: z.infer<typeof notifPrefsSchema>) { return { user: publicUser(await this.auth.updateNotifPrefs(auth, body)) }; }
  @Post('delete-account') @HttpCode(200)
  async deleteAccount(@Auth() auth: AuthContext, @Body(Z(elevateSchema)) body: z.infer<typeof elevateSchema>, @Res({ passthrough: true }) res: Response) { await this.auth.deleteAccount(auth, body.password); clearSessionCookies(res); return { ok: true }; }
}
