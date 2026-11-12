import { Injectable } from '@nestjs/common';
import type { OutboxJobType, Prisma } from '@ieventplux/db';
import { PrismaService } from './prisma.service.js';
/** Durable outbox: write the job in the same transaction as the business change; the worker claims it with SKIP LOCKED and enqueues BullMQ with jobId=outbox id. */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}
  enqueue(type: OutboxJobType, payload: Record<string, unknown>, opts: { runAt?: Date; maxAttempts?: number } = {}, tx: Prisma.TransactionClient = this.prisma) {
    return tx.outboxJob.create({ data: { type, payload: payload as Prisma.InputJsonValue, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 } });
  }
}
