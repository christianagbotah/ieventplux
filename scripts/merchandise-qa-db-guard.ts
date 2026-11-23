/** Fail closed before any synthetic merchandise QA fixture or session writes. */
import { strict as assert } from 'node:assert'

const schema = 'ieventplux_merch_qa_20261119'
const qaDatabaseName = 'ieventplux_merch_qa'

export function validateIsolatedMerchandiseQaUrl() {
  const url = new URL(process.env.DATABASE_URL ?? 'http://invalid.invalid')
  assert.ok(['postgresql:', 'postgres:'].includes(url.protocol), 'QA requires a PostgreSQL URL')
  // Prisma/PostgreSQL URLs accept additional parameters that can redirect the
  // effective connection or alter its search path. Fail closed on *all* unknown
  // parameters rather than maintaining an incomplete blacklist.
  assert.ok([...url.searchParams.keys()].every((key) => key === 'schema'),
    'QA permits only the explicit isolated schema connection parameter')
  assert.ok(!url.hash, 'QA URL must not include a fragment')

  assert.equal(url.searchParams.getAll('schema').length, 1, 'QA requires exactly one schema parameter')
  assert.ok(!url.searchParams.has('options'), 'QA must not override PostgreSQL connection options')
  assert.equal(url.searchParams.get('schema'), schema, 'QA requires the isolated schema')
  assert.equal(decodeURIComponent(url.pathname).slice(1), qaDatabaseName, 'QA requires the exact disposable database name')
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname), 'QA requires loopback PostgreSQL')
  // An alternate local port may point at a forwarded production instance.
  assert.equal(url.port, '5432', 'QA requires the dedicated local PostgreSQL port 5432')
}

export async function requireIsolatedMerchandiseQaDatabase() {
  validateIsolatedMerchandiseQaUrl()
  // Do not initialize Prisma until the supplied URL passes all isolation checks.
  const { db } = await import('../src/lib/db')
  const [identity] = await db.$queryRaw<Array<{ database_name: string; schema_name: string }>>`
    SELECT current_database() AS database_name, current_schema() AS schema_name
  `
  assert.ok(identity, 'PostgreSQL identity unavailable')
  assert.equal(identity.database_name, qaDatabaseName, 'Connected database is not the expected disposable QA database')
  assert.equal(identity.schema_name, schema, 'Connected PostgreSQL schema is not QA')
}
