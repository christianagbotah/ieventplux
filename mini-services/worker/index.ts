/**
 * iEventPlux background worker (:3001).
 *
 * Durable job processing over the SQLite-backed OutboxJob table (the database is
 * the source of truth — a crashed worker loses nothing; locked jobs are reclaimed).
 * Every handler is idempotent, so retries never duplicate paid effects.
 */
import { createServer } from 'http'
import { runJob } from '../../src/server/jobs/handlers'
import { db } from '../../src/lib/db'

const PORT = Number(process.env.WORKER_PORT ?? 3001)
const WORKER_SECRET = process.env.WORKER_SECRET ?? 'dev-worker-secret'
const WORKER_ID = `worker-${process.pid}-${Math.random().toString(36).slice(2, 6)}`

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'healthy', service: 'ieventplux-worker', workerId: WORKER_ID, uptimeSec: Math.round(process.uptime()) }))
    return
  }
  if (url.pathname === '/stats' && req.headers['x-worker-secret'] === WORKER_SECRET) {
    void (async () => {
      const byStatus = await db.outboxJob.groupBy({ by: ['status'], _count: true }).catch(() => [])
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ workerId: WORKER_ID, byStatus }))
    })()
    return
  }
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not_found' }))
})

// ── Job claiming with lock + stale-lock reclaim ─────────────────────────────
async function claimAndRunOne(): Promise<boolean> {
  const now = new Date()
  const staleCutoff = new Date(now.getTime() - 90_000)
  const job = await db.outboxJob.findFirst({
    where: {
      status: 'QUEUED',
      runAt: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleCutoff } }],
    },
    orderBy: { runAt: 'asc' },
  })
  if (!job) return false

  const claimed = await db.outboxJob.updateMany({
    where: { id: job.id, status: 'QUEUED', OR: [{ lockedAt: null }, { lockedAt: { lt: staleCutoff } }] },
    data: { status: 'RUNNING', lockedAt: now, lockedBy: WORKER_ID },
  })
  if (claimed.count === 0) return false // another worker won the race

  try {
    const payload = JSON.parse(job.payload || '{}') as Record<string, unknown>
    await runJob(job.type, payload)
    await db.outboxJob.update({ where: { id: job.id }, data: { status: 'DONE', completedAt: new Date(), lastError: null } })
    console.log(`[worker] ✓ ${job.type} ${job.id}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const attempts = job.attempts + 1
    if (attempts >= job.maxAttempts) {
      await db.outboxJob.update({ where: { id: job.id }, data: { status: 'DEAD', attempts, lastError: message.slice(0, 500), lockedAt: null, lockedBy: null } })
      console.error(`[worker] ✗ DEAD ${job.type} ${job.id}: ${message}`)
    } else {
      const backoffMs = Math.min(5 * 60_000, 2_000 * 2 ** attempts)
      await db.outboxJob.update({
        where: { id: job.id },
        data: { status: 'QUEUED', attempts, lastError: message.slice(0, 500), runAt: new Date(Date.now() + backoffMs), lockedAt: null, lockedBy: null },
      })
      console.warn(`[worker] ↻ retry ${job.type} ${job.id} in ${backoffMs}ms: ${message}`)
    }
  }
  return true
}

async function drainQueue(max = 20): Promise<number> {
  let processed = 0
  for (let i = 0; i < max; i++) {
    const ran = await claimAndRunOne()
    if (!ran) break
    processed += 1
  }
  return processed
}

// ── Periodic sweeps (idempotent; safe when enqueued repeatedly) ─────────────
const SWEEPS = [
  { type: 'RESERVATION_SWEEP', everyMs: 20_000 },
  { type: 'EVENT_LIFECYCLE', everyMs: 60_000 },
  { type: 'REMINDER_SWEEP', everyMs: 300_000 },
  { type: 'RECONCILE_PAYMENT', everyMs: 60_000 },
  { type: 'SMS_STATUS_POLL', everyMs: 30_000 },
  { type: 'PLAYBACK_CLEANUP', everyMs: 120_000 },
  { type: 'WAITLIST_SWEEP', everyMs: 60_000 },
] as const

async function enqueueDueSweeps() {
  const now = new Date()
  for (const sweep of SWEEPS) {
    const key = `sweep:${sweep.type}`
    const marker = sweepState.get(key)
    if (marker && now.getTime() - marker < sweep.everyMs) continue
    sweepState.set(key, now.getTime())
    // Skip if a job of this type is already queued/running (no stampede).
    const existing = await db.outboxJob.findFirst({ where: { type: sweep.type, status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true } })
    if (!existing) {
      await db.outboxJob.create({ data: { type: sweep.type, payload: '{}', runAt: now, maxAttempts: 3 } })
    }
  }
}

const sweepState = new Map<string, number>()

// ── Main loops ──────────────────────────────────────────────────────────────
let processing = false
async function tick() {
  if (processing) return
  processing = true
  try {
    await enqueueDueSweeps()
    await drainQueue()
  } catch (err) {
    console.error('[worker] tick error', err instanceof Error ? err.message : err)
  } finally {
    processing = false
  }
}

httpServer.listen(PORT, () => {
  console.log(`[worker] ${WORKER_ID} listening on :${PORT}`)
  void tick()
  setInterval(() => void tick(), 5000)
})

process.on('SIGTERM', () => {
  console.log('[worker] shutting down')
  process.exit(0)
})
