// Query helper for dev verification against the embedded Postgres cluster.
// Usage: bun scripts/db-query.ts "SELECT ..."
import { Client } from 'pg'

const sql = process.argv[2]
if (!sql) {
  console.error('usage: bun scripts/db-query.ts "SELECT ..."')
  process.exit(1)
}
const c = new Client({ host: '127.0.0.1', port: 5432, user: 'postgres', database: 'ieventplux' })
await c.connect()
try {
  const r = await c.query(sql)
  console.log(JSON.stringify(r.rows, null, 1))
} finally {
  await c.end()
  process.exit(0)
}
