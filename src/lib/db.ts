import { PrismaClient } from '@prisma/client'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ────────────────────────── Database URL resolution ──────────────────────────
// This deployment's convention (see .env.example): the project-root `.env` is the
// operator-maintained source of truth for DATABASE_URL. The sandbox session init
// EXPORTS a packaged SQLite default into the process environment, and both Bun and
// Next.js let the exported variable win over `.env` files — so a provider switch
// in `.env` alone would be silently ignored. Rule implemented here:
//   * a REAL externally-provisioned URL (any value other than the known packaged
//     defaults below) always wins — production env vars are respected as-is;
//   * otherwise the DATABASE_URL line from the nearest project-root `.env`
//     (walking up from cwd, so the worker/realtime mini-services resolve the same
//     file as the Next.js app) is applied before any PrismaClient is constructed.
const PACKAGED_SQLITE_DEFAULTS = new Set([
  'file:/home/z/my-project/db/custom.db',
  'file:/app/db/custom.db',
])

function resolveDatabaseUrl(): void {
  const fromProcess = process.env.DATABASE_URL
  if (fromProcess && !PACKAGED_SQLITE_DEFAULTS.has(fromProcess)) return
  let dir = process.cwd()
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, '.env')
    if (existsSync(candidate)) {
      const match = /^DATABASE_URL=(.+)$/m.exec(readFileSync(candidate, 'utf8'))
      if (match) {
        const url = match[1].trim()
        if (url && url !== fromProcess) process.env.DATABASE_URL = url
        return
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return
    dir = parent
  }
}

resolveDatabaseUrl()

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
