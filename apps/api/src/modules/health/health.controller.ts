import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth.js';
import { PrismaService } from '../../common/prisma.service.js';
import { RedisService } from '../../common/redis.service.js';
import { loadEnv } from '@ieventplux/config';
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}
  @Public() @Get('health')
  async health() {
    const checks: Record<string, 'ok' | 'fail'> = { db: 'fail', redis: 'fail' };
    try { await this.prisma.$queryRaw`SELECT 1`; checks.db = 'ok'; } catch { /* reported below */ }
    try { if ((await this.redis.client.ping()) === 'PONG') checks.redis = 'ok'; } catch { /* reported below */ }
    const env = loadEnv();
    return { status: Object.values(checks).every((c) => c === 'ok') ? 'ok' : 'degraded', checks, hubtelMode: env.HUBTEL_MODE, appEnv: env.APP_ENV, time: new Date().toISOString() };
  }
}
