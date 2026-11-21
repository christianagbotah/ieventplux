/** Fail closed before any synthetic merchandise QA fixture or session writes. */
import { strict as assert } from 'node:assert'
import { db } from '../src/lib/db'

const schema = 'ieventplux_merch_qa_20261119'
const qaName = /(?:^|[_-])(qa|test|scratch)(?:[_-]|$)/i

export async function requireIsolatedMerchandiseQaDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? 'http://invalid.invalid')
  assert.equal(url.searchParams.get('schema'), schema, 'QA requires the isolated schema')
  assert.match(decodeURIComponent(url.pathname).slice(1), qaName, 'QA requires a disposable database name')
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname), 'QA requires loopback PostgreSQL')
  const [identity] = await db.$queryRaw<Array<{ database_name: string; schema_name: string }>>`
    SELECT current_database() AS database_name, current_schema() AS schema_name
  `
  assert.ok(identity, 'PostgreSQL identity unavailable')
  assert.match(identity.database_name, qaName, 'Connected database is not disposable QA')
  assert.equal(identity.schema_name, schema, 'Connected PostgreSQL schema is not QA')
}
