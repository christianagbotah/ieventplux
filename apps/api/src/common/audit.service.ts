import { Injectable } from '@nestjs/common';
import type { Prisma } from '@ieventplux/db';
import { PrismaService } from './prisma.service.js';
export interface AuditInput { actorUserId?: string | null; actorLabel: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; ip?: string | null; reason?: string | null }
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  async log(input: AuditInput, tx: Prisma.TransactionClient = this.prisma) {
    await tx.auditLog.create({ data: { actorUserId: input.actorUserId ?? null, actorLabel: input.actorLabel, action: input.action, entityType: input.entityType, entityId: input.entityId, before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined, after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined, ip: input.ip ?? null, reason: input.reason ?? null } });
  }
}
