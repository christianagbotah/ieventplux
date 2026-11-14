import { db } from '@/lib/db'

/**
 * Ops monitoring — the single check-runner shared by every surface:
 *  - `scripts/monitor.ts` (the standing loop / `--once` one-shot),
 *  - the admin console's "Run check now" button (POST /admin/ops/check).
 *
 * Honesty contract:
 *  - Every target gets a durable OpsCheck row per cycle (uptime history — the
 *    "nothing has run under real load" gap now has a recorded trail).
 *  - Alerts are TRANSITION-based: raised when a target first goes non-UP,
 *    resolved when it comes back — not re-opened on every failed cycle.
 *  - The app target asserts its own health endpoint (which itself probes the
 *    database); the database target is additionally probed directly so a total
 *    app outage still yields a truthful database verdict.
 *  - Latency is wall-clock around the probe, reported verbatim (no smoothing).
 */

export type OpsTarget = 'app' | 'worker' | 'realtime' | 'database'
export type OpsStatus = 'UP' | 'DEGRADED' | 'DOWN'

export interface TargetProbe {
  target: OpsTarget
  status: OpsStatus
  latencyMs: number
  detail?: string
}

const PROBE_TIMEOUT_MS = 5_000

interface ProbeResult {
  ok: boolean
  statusCode: number
  body: Record<string, unknown> | null
  latencyMs: number
  err?: string
}

async function fetchWithTimeout(url: string): Promise<ProbeResult> {
  const t0 = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ac.signal, cache: 'no-store' })
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { ok: res.ok, statusCode: res.status, body, latencyMs: Date.now() - t0 }
  } catch (err) {
    return { ok: false, statusCode: 0, body: null, latencyMs: Date.now() - t0, err: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

/** Run one check cycle against every target (no persistence — pure probe). */
export async function runOpsChecks(appBase: string): Promise<TargetProbe[]> {
  const probes: TargetProbe[] = []

  // App — the Next.js API. Its health endpoint already asserts DB connectivity
  // and boot-time env validation, so "healthy" here means what it says.
  const app = await fetchWithTimeout(`${appBase}/api/v1/health`)
  if (!app.ok) {
    probes.push({ target: 'app', status: 'DOWN', latencyMs: app.latencyMs, detail: app.err ?? `HTTP ${app.statusCode}` })
  } else {
    const status = String(app.body?.status ?? '')
    const database = String(app.body?.database ?? '')
    if (status !== 'healthy' || database !== 'up') {
      probes.push({ target: 'app', status: 'DEGRADED', latencyMs: app.latencyMs, detail: `health=${status || 'unknown'} db=${database || 'unknown'}` })
    } else {
      probes.push({ target: 'app', status: 'UP', latencyMs: app.latencyMs })
    }
  }

  // Mini-services behind the gateway.
  for (const [target, url] of [
    ['worker', `http://127.0.0.1:${Number(process.env.WORKER_PORT ?? 3001)}/health`],
    ['realtime', `http://127.0.0.1:${Number(process.env.REALTIME_PORT ?? 3003)}/health`],
  ] as const) {
    const r = await fetchWithTimeout(url)
    probes.push(
      r.ok
        ? { target, status: 'UP', latencyMs: r.latencyMs }
        : { target, status: 'DOWN', latencyMs: r.latencyMs, detail: r.err ?? `HTTP ${r.statusCode}` },
    )
  }

  // Database — direct connectivity, independent of the app process.
  const dbT0 = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    probes.push({ target: 'database', status: 'UP', latencyMs: Date.now() - dbT0 })
  } catch (err) {
    probes.push({ target: 'database', status: 'DOWN', latencyMs: Date.now() - dbT0, detail: err instanceof Error ? err.message : String(err) })
  }

  return probes
}

/** Persist one cycle: OpsCheck rows + transition-based alert lifecycle. */
export async function recordOpsChecks(probes: TargetProbe[]): Promise<{ created: number; alertsOpened: number; alertsResolved: number }> {
  let alertsOpened = 0
  let alertsResolved = 0

  for (const probe of probes) {
    await db.opsCheck.create({
      data: { target: probe.target, status: probe.status, latencyMs: probe.latencyMs, detail: probe.detail ?? null },
    })

    const openAlert = await db.opsAlert.findFirst({
      where: { target: probe.target, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    })

    if (probe.status === 'UP') {
      if (openAlert) {
        await db.opsAlert.update({
          where: { id: openAlert.id },
          data: {
            status: 'RESOLVED',
            resolvedAt: new Date(),
            detail: `${openAlert.detail ?? ''} — recovered after ${openAlert.checksWhileOpen + 1} non-UP check${openAlert.checksWhileOpen + 1 === 1 ? '' : 's'}.`.trim(),
          },
        })
        alertsResolved += 1
      }
      continue
    }

    if (openAlert) {
      // Still down/degraded — count the cycle, escalate severity if it worsened.
      const worsened = probe.status === 'DOWN' && openAlert.severity === 'WARNING'
      await db.opsAlert.update({
        where: { id: openAlert.id },
        data: { checksWhileOpen: { increment: 1 }, ...(worsened ? { severity: 'CRITICAL' } : {}) },
      })
      continue
    }

    await db.opsAlert.create({
      data: {
        target: probe.target,
        severity: probe.status === 'DOWN' ? 'CRITICAL' : 'WARNING',
        title: probe.status === 'DOWN' ? `${probe.target} is DOWN` : `${probe.target} is degraded`,
        detail: probe.detail ?? null,
        status: 'OPEN',
      },
    })
    alertsOpened += 1
  }

  return { created: probes.length, alertsOpened, alertsResolved }
}

/** Retention: checks 7 days, resolved alerts 30 days (open alerts are never pruned). */
export async function pruneOpsHistory(): Promise<{ checks: number; alerts: number }> {
  const checks = await db.opsCheck.deleteMany({ where: { checkedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } })
  const alerts = await db.opsAlert.deleteMany({ where: { status: 'RESOLVED', resolvedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } })
  return { checks: checks.count, alerts: alerts.count }
}
