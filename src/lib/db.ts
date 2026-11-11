import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// SQLite in this deployment is shared by the Next.js API and the worker/realtime
// mini-services. WAL mode is required for safe concurrent readers/writer.
async function configureSQLite(prisma: PrismaClient) {
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;')
    await prisma.$executeRawUnsafe('PRAGMA busy_timeout=5000;')
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON;')
  } catch {
    // Non-fatal: single-process operation still works without WAL.
  }
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = db
  void configureSQLite(db)
}
