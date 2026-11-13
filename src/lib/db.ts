import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// SQLite in this deployment is shared by the Next.js API and the worker/realtime
// mini-services. WAL mode is required for safe concurrent readers/writer.
// Under PostgreSQL the equivalent guarantees come from the server itself
// (MVCC, per-connection timeouts) — these PRAGMAs are SQLite-only and MUST NOT
// be sent to a Postgres connection (they are a syntax error there).
async function configureSQLite(prisma: PrismaClient) {
  try {
    // PRAGMAs that return values (journal_mode, busy_timeout) must use queryRaw.
    await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;')
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000;')
    await prisma.$queryRawUnsafe('PRAGMA foreign_keys=ON;')
  } catch {
    // Non-fatal: single-process operation still works without WAL.
  }
}

/** SQLite is only in play when the URL is a file: (or bare) path — never for postgres://. */
function isSqliteUrl(url: string): boolean {
  const u = url.trim().toLowerCase()
  return u.startsWith('file:') || u === '' || (!u.includes('://') && !u.startsWith('postgres'))
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = db
  if (isSqliteUrl(process.env.DATABASE_URL ?? 'file:./db/custom.db')) {
    void configureSQLite(db)
  }
}
