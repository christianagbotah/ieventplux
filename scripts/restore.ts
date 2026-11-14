/**
 * Logical database restore — the OTHER half of a backup.
 *
 *   bun run ops:restore -- --file backups/ieventplux-…jsonl.gz --target postgresql://postgres@127.0.0.1:5432/scratch
 *
 * A backup that has never been restored is a hypothesis, not a backup. This
 * script makes restore a REHEARSABLE operation:
 *   1. reads a backup produced by scripts/backup.ts (gzip JSONL, one row per
 *      line: {"t":"Table","r":{…}}),
 *   2. requires the TARGET database to already have the schema (run
 *      `prisma db push` against the target URL first — the script verifies and
 *      tells you if tables are missing),
 *   3. truncates the target's data tables (the restore is idempotent),
 *   4. inserts every row in FOREIGN-KEY topological order (the order the dump
 *      was written in is alphabetical, which is NOT dependency-safe),
 *   5. verifies per-table: rows inserted vs rows in the dump — a mismatch is a
 *      FAILED restore (exit 1), never a silent partial success.
 *
 * Safety contract:
 *   - TARGET REQUIRED. Without --target / RESTORE_TARGET_URL it refuses to run.
 *   - Refuses to restore into the LIVE database (the URL this project resolves
 *     as its own DATABASE_URL) — pass --i-know-this-wipes-live to override.
 *   - Never touches RateLimitBucket / __prisma_migrations (same exclusions as
 *     the backup).
 *
 * Postgres serialization reversals:
 *   - digit-string  → bigint column (per information_schema column type)
 *   - {__base64}    → bytea column (Buffer)
 * Everything else is passed through as text and cast by the column type.
 */

import { gunzipSync } from 'node:zlib'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { db } from '../src/lib/db'

const EXCLUDED_TABLES = new Set(['RateLimitBucket', '__prisma_migrations'])

interface DumpRow {
  t: string
  r: Record<string, unknown>
}

function parseArgs(): { file: string; target: string; forceLive: boolean } {
  const argv = process.argv.slice(2)
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const file = get('--file') ?? newestBackup('backups')
  const target = get('--target') ?? process.env.RESTORE_TARGET_URL
  const forceLive = argv.includes('--i-know-this-wipes-live')
  return { file, target: target ?? '', forceLive }
}

function newestBackup(dir: string): string {
  try {
    const f = readdirSync(dir)
      .filter((n) => n.startsWith('ieventplux-') && n.endsWith('.jsonl.gz'))
      .map((n) => ({ n, m: statSync(join(dir, n)).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0]?.n
    if (!f) throw new Error('no backups found')
    return join(dir, f)
  } catch {
    throw new Error(`No --file given and no snapshot found in ${dir}/ — run ops:backup first or pass --file explicitly.`)
  }
}

/** Bigint digit-string columns of the TARGET schema (per information_schema). */
async function bigintColumns(client: pg.Client): Promise<Map<string, Set<string>>> {
  const res = await client.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND data_type = 'bigint'`,
  )
  const map = new Map<string, Set<string>>()
  for (const { table_name, column_name } of res.rows) {
    if (!map.has(table_name)) map.set(table_name, new Set())
    map.get(table_name)!.add(column_name)
  }
  return map
}

/** Topological order of the given tables by FK dependencies (deps first). */
async function fkTopoOrder(client: pg.Client, tables: string[]): Promise<string[]> {
  const safe = new Set(tables)
  const res = await client.query<{ table_name: string; referenced: string }>(
    `SELECT tc.table_name, ccu.table_name AS referenced
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
  )
  const edges = new Map<string, Set<string>>()
  for (const { table_name, referenced } of res.rows) {
    if (!safe.has(table_name) || !safe.has(referenced) || table_name === referenced) continue
    if (!edges.has(table_name)) edges.set(table_name, new Set())
    edges.get(table_name)!.add(referenced)
  }
  const out: string[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (t: string): void => {
    const s = state.get(t)
    if (s === 'done') return
    if (s === 'visiting') throw new Error(`FK cycle involving ${t} — topological order impossible`)
    state.set(t, 'visiting')
    for (const dep of edges.get(t) ?? []) visit(dep)
    state.set(t, 'done')
    out.push(t)
  }
  for (const t of tables) visit(t)
  return out
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unsafe table name: ${name}`)
  return `"${name}"`
}

async function main(): Promise<void> {
  const { file, target, forceLive } = parseArgs()
  if (!target) {
    console.error('ops:restore refuses to guess — pass --target <DATABASE_URL> (or RESTORE_TARGET_URL).')
    console.error('The target must have the schema already: DATABASE_URL=<target> bunx prisma db push')
    process.exit(1)
  }

  // Guard: never restore over the live database by accident.
  const liveUrl = process.env.DATABASE_URL ?? ''
  if (target === liveUrl && !forceLive) {
    console.error('REFUSED: the target URL is this project\'s LIVE database. A restore truncates every table.')
    console.error('Rehearse into a scratch database (create it, db:push against it), or pass --i-know-this-wipes-live.')
    process.exit(1)
  }

  // 1 — read the dump
  const raw = gunzipSync(readFileSync(file)).toString('utf8')
  const rows: DumpRow[] = []
  const byTable = new Map<string, number>()
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const parsed = JSON.parse(line) as DumpRow
    if (!parsed.t || typeof parsed.r !== 'object') throw new Error(`Malformed dump line: ${line.slice(0, 60)}`)
    rows.push(parsed)
    byTable.set(parsed.t, (byTable.get(parsed.t) ?? 0) + 1)
  }
  const tables = [...byTable.keys()].filter((t) => !EXCLUDED_TABLES.has(t)).sort()
  console.log(`Restore: ${file}`)
  console.log(`  dump: ${tables.length} tables, ${rows.length} rows (excluded scratch tables skipped)`)

  // 2 — connect to the target
  const client = new pg.Client({ connectionString: target })
  await client.connect()
  try {
    // Schema presence check.
    const have = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
    )
    const haveSet = new Set(have.rows.map((r) => r.table_name))
    const missing = tables.filter((t) => !haveSet.has(t))
    if (missing.length > 0) {
      console.error(`REFUSED: target schema is missing ${missing.length} table(s): ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}`)
      console.error('Run the schema first:  DATABASE_URL=<target> bunx prisma db push')
      process.exit(1)
    }

    const bigints = await bigintColumns(client)
    const order = await fkTopoOrder(client, tables)

    // 3 — truncate ALL target data tables (not just dump tables): a recovery
    // must yield exactly the snapshot state — data in a table that was empty
    // at backup time has to go too. Excluded scratch tables stay.
    const allDataTables = haveSet.has('__prisma_migrations')
      ? [...haveSet].filter((t) => !EXCLUDED_TABLES.has(t) && t !== '__prisma_migrations')
      : [...haveSet].filter((t) => !EXCLUDED_TABLES.has(t))
    await client.query(`TRUNCATE ${allDataTables.map(quoteIdent).join(', ')} CASCADE`)

    // 4 — insert, deps-first
    let inserted = 0
    const insertedByTable = new Map<string, number>()
    for (const table of order) {
      const tableRows = rows.filter((r) => r.t === table)
      if (tableRows.length === 0) continue
      const cols = Object.keys(tableRows[0].r)
      const big = bigints.get(table) ?? new Set<string>()
      for (let i = 0; i < tableRows.length; i += 100) {
        const chunk = tableRows.slice(i, i + 100)
        const params: unknown[] = []
        const tuples = chunk.map((row) => {
          const placeholders = cols.map((c, ci) => {
            const v = row.r[c]
            let out: unknown = v
            if (v && typeof v === 'object' && !Array.isArray(v) && '__base64' in (v as Record<string, unknown>)) {
              out = Buffer.from((v as { __base64: string }).__base64, 'base64')
            } else if (big.has(c) && typeof v === 'string' && /^-?\d+$/.test(v)) {
              out = BigInt(v)
            }
            params.push(out)
            return `$${params.length}`
          })
          return `(${placeholders.join(', ')})`
        })
        const colList = cols.map(quoteIdent).join(', ')
        await client.query(`INSERT INTO ${quoteIdent(table)} (${colList}) VALUES ${tuples.join(', ')}`, params)
        inserted += chunk.length
      }
      insertedByTable.set(table, tableRows.length)
    }

    // 5 — verify: dump counts vs database counts
    const mismatches: string[] = []
    for (const t of tables) {
      const expected = byTable.get(t) ?? 0
      const got = await client.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM ${quoteIdent(t)}`)
      const actual = Number(got.rows[0]?.n ?? 0)
      if (actual !== expected) mismatches.push(`${t}: dump ${expected} vs restored ${actual}`)
    }

    console.log(`  inserted ${inserted} rows across ${insertedByTable.size} tables (FK order: ${order.slice(0, 4).join(' → ')} → …)`)
    if (mismatches.length > 0) {
      console.error('  RESTORE FAILED — count mismatches:')
      for (const m of mismatches) console.error(`    ${m}`)
      process.exitCode = 1
    } else {
      console.log(`  verification: every restored table's count matches the dump — restore OK`)
    }
  } finally {
    await client.end().catch(() => {})
    await db.$disconnect().catch(() => {})
  }
}

await main()
