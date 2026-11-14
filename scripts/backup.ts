/**
 * Logical database backup — one gzip'd JSONL snapshot of every table.
 *
 *   bun run ops:backup
 *
 * Each line: {"t":"TableName","r":{…row…}}. Rows are streamed table-by-table
 * through Prisma's raw query so this works on BOTH providers (PostgreSQL in
 * this deployment, SQLite fallback). A BackupRun audit row records start/end,
 * table/row counts, byte size, SHA-256 checksum and any error — the admin
 * Ops Health tab renders that trail.
 *
 * Honesty contract:
 *  - This is a LOGICAL dump (portable, human-inspectable, provider-agnostic).
 *    For a production PostgreSQL deployment the runbook (docs/DEPLOYMENT.md)
 *    additionally schedules pg_dump — physical/point-in-time recovery needs
 *    the provider's own tooling, not JSONL.
 *  - The backup is verified after writing: the file is re-read and its line
 *    count must equal the counted rows (checksum recorded either way).
 *  - Retention keeps the newest N snapshots (default 30) and deletes older
 *    files in the backups/ directory.
 *
 * Environment:
 *   BACKUP_DIR        output directory (default ./backups)
 *   BACKUP_RETENTION  snapshots to keep (default 30)
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { db, isSqliteUrl } from '../src/lib/db'

const BACKUP_DIR = process.env.BACKUP_DIR ?? 'backups'
const RETENTION = Math.max(1, Number(process.env.BACKUP_RETENTION ?? 30) || 30)

/** Tables that are per-instance scratch (never user data) and are skipped. */
const EXCLUDED_TABLES = new Set(['RateLimitBucket', '__prisma_migrations'])

function quoteIdent(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unsafe table name from catalog: ${name}`)
  return `"${name}"`
}

async function listTables(): Promise<string[]> {
  const sqlite = isSqliteUrl(process.env.DATABASE_URL ?? '')
  const rows = sqlite
    ? ((await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")) as { name: string }[])
    : ((await db.$queryRawUnsafe("SELECT tablename AS name FROM pg_tables WHERE schemaname='public'")) as { name: string }[])
  return rows.map((r) => r.name).filter((n) => !EXCLUDED_TABLES.has(n)).sort()
}

/** BigInt → digits-string; Buffer/Uint8Array → base64 marker; Date → ISO (native). */
function serializeRow(row: Record<string, unknown>): string {
  return JSON.stringify(row, (_k, v) => {
    if (typeof v === 'bigint') return v.toString()
    if (v instanceof Uint8Array) return { __base64: Buffer.from(v).toString('base64') }
    return v
  })
}

async function main(): Promise<void> {
  const run = await db.backupRun.create({ data: { status: 'RUNNING', path: '(pending)' } })
  try {
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })

    const tables = await listTables()
    const lines: string[] = []
    let tableRows = 0
    for (const table of tables) {
      const rows = (await db.$queryRawUnsafe(`SELECT * FROM ${quoteIdent(table)}`)) as Record<string, unknown>[]
      for (const row of rows) {
        lines.push(JSON.stringify({ t: table, r: JSON.parse(serializeRow(row)) }))
      }
      tableRows += rows.length
    }

    const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+$/, '')
    const path = join(BACKUP_DIR, `ieventplux-${stamp}.jsonl.gz`)
    const payload = Buffer.from(gzipSync(Buffer.from(lines.join('\n') + '\n', 'utf8')))
    writeFileSync(path, payload)
    const checksum = createHash('sha256').update(payload).digest('hex')

    // Verify: re-read and count lines.
    const reread = gunzipSync(readFileSync(path)).toString('utf8').trim()
    const lineCount = reread ? reread.split('\n').length : 0
    const verified = lineCount === tableRows

    await db.backupRun.update({
      where: { id: run.id },
      data: {
        status: verified ? 'OK' : 'FAILED',
        finishedAt: new Date(),
        tables: tables.length,
        tableRows,
        bytes: BigInt(payload.byteLength),
        path,
        checksum,
        error: verified ? null : `Verification mismatch: wrote ${tableRows} rows, read back ${lineCount}.`,
      },
    })

    // Retention: newest RETENTION files stay.
    const files = readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('ieventplux-') && f.endsWith('.jsonl.gz'))
      .map((f) => ({ f, mtime: statSync(join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    for (const old of files.slice(RETENTION)) unlinkSync(join(BACKUP_DIR, old.f))

    console.log(`Backup OK — ${path}`)
    console.log(`  ${tables.length} tables, ${tableRows} rows, ${(payload.byteLength / 1024).toFixed(1)} KB (gzip), sha256 ${checksum.slice(0, 16)}…`)
    console.log(`  verification: ${verified ? 'line count matches on re-read' : 'MISMATCH'} · retention: ${Math.min(files.length, RETENTION)} kept`)
    if (!verified) process.exitCode = 1
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.backupRun
      .update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: new Date(), path: BACKUP_DIR, error: message } })
      .catch(() => {})
    console.error('Backup FAILED:', message)
    process.exitCode = 1
  } finally {
    await db.$disconnect().catch(() => {})
  }
}

await main()
