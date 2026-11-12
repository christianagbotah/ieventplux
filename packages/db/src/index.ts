import { PrismaClient } from '@prisma/client';
import { loadEnv } from '@ieventplux/config';
export * from '@prisma/client';
export { PrismaClient };
export const db = new PrismaClient({ datasourceUrl: loadEnv().DATABASE_URL });
