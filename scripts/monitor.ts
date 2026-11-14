/**
 * Ops monitor — the standing health loop for the iEventPlux stack.
 *
 *   bun run ops:monitor            # loop (default: every 30 s)
 *   bun run ops:monitor -- --once  # single cycle, then exit (cron-style)
 *
 * Targets: app (:3000 health), worker (:3001), realtime (:3003), database
 * (direct Prisma probe). Each cycle writes durable OpsCheck rows and manages
 * transition-based OpsAlerts (see src/server/ops/monitor.ts for the honesty
 * contract). History is served to the admin console's Ops Health tab via
 * GET /api/v1/admin/ops.
 *
 * Environment:
 *   APP_URL                base URL of the app (default http://localhost:3000)
 *   MONITOR_INTERVAL_SEC   seconds between cycles (default 30)
 */

import { runOpsChecks, recordOpsChecks, pruneOpsHistory } from '../src/server/ops/monitor'

const APP_BASE = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const INTERVAL_SEC = Math.max(10, Number(process.env.MONITOR_INTERVAL_SEC ?? 30) || 30)
const once = process.argv.includes('--once')

function line(probe: { target: string; status: string; latencyMs: number; detail?: string }): string {
  const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length))
  return `  ${pad(probe.target, 9)} ${pad(probe.status, 9)} ${String(probe.latencyMs).padStart(5)} ms  ${probe.detail ?? ''}`
}

let lastPruneAt = 0

async function cycle(): Promise<boolean> {
  const t0 = Date.now()
  const probes = await runOpsChecks(APP_BASE)
  const recorded = await recordOpsChecks(probes)
  const stamp = new Date().toISOString().slice(11, 19)
  console.log(`[${stamp}] ops cycle (${Date.now() - t0} ms total)`)
  for (const p of probes) console.log(line(p))
  if (recorded.alertsOpened > 0) console.log(`  ! ${recorded.alertsOpened} NEW alert(s) opened`)
  if (recorded.alertsResolved > 0) console.log(`  + ${recorded.alertsResolved} alert(s) resolved`)
  // Hourly retention sweep (checks: 7 days, resolved alerts: 30 days).
  if (Date.now() - lastPruneAt > 3_600_000) {
    lastPruneAt = Date.now()
    const pruned = await pruneOpsHistory()
    if (pruned.checks + pruned.alerts > 0) console.log(`  ~ pruned ${pruned.checks} old check(s), ${pruned.alerts} resolved alert(s)`)
  }
  return probes.every((p) => p.status === 'UP')
}

if (once) {
  const allUp = await cycle()
  console.log(allUp ? 'One-shot ops check: all targets UP.' : 'One-shot ops check: NOT all targets are UP — see above.')
  process.exit(allUp ? 0 : 1)
} else {
  console.log(`iEventPlux ops monitor — probing ${APP_BASE} + worker + realtime + database every ${INTERVAL_SEC}s (Ctrl+C to stop)`)
  await cycle()
  setInterval(() => void cycle(), INTERVAL_SEC * 1_000)
}
