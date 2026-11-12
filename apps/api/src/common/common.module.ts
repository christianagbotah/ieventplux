import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { AuthzService } from './authz.service.js';
import { AuditService } from './audit.service.js';
import { OutboxService } from './outbox.service.js';
@Global()
@Module({ providers: [PrismaService, RedisService, AuthzService, AuditService, OutboxService], exports: [PrismaService, RedisService, AuthzService, AuditService, OutboxService] })
export class CommonModule {}
