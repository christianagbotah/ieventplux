import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { CommonModule } from './common/common.module.js';
import { AppExceptionFilter } from './common/errors.js';
import { SessionGuard } from './common/auth.js';
import { HealthController } from './modules/health/health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { OrgsModule } from './modules/orgs/orgs.module.js';

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info', genReqId: (req, res) => { const id = (req.headers['x-request-id'] as string) ?? randomUUID(); res.setHeader('x-request-id', id); return id; }, redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'], autoLogging: { ignore: (req) => req.url === '/api/v1/health' }, transport: process.env.APP_ENV === 'development' ? { target: 'pino/file', options: { destination: 1 } } : undefined } }),
    CommonModule, AuthModule, OrgsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }, { provide: APP_FILTER, useClass: AppExceptionFilter }],
})
export class AppModule {}
