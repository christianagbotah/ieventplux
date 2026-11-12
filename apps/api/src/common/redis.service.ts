import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { loadEnv } from '@ieventplux/config';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false, enableOfflineQueue: true });
  async onModuleDestroy() { await this.client.quit().catch(() => undefined); }
  /** Fixed-window counter; returns true when the request is allowed. */
  async allow(key: string, limit: number, windowSec: number): Promise<boolean> {
    const k = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const n = await this.client.incr(k);
    if (n === 1) await this.client.expire(k, windowSec);
    return n <= limit;
  }
}
