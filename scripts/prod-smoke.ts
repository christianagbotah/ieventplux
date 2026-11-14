/**
 * Safe, READ-ONLY smoke checks for a deployed production iEventPlux URL.
 * Unlike scripts/smoke.ts, this NEVER logs in as demo users, creates orders,
 * simulates payments or writes password-reset/rate-limit state.
 *
 * Usage: PROD_SMOKE_BASE_URL=https://events.example.com/api/v1 bun run prod:smoke
 * Optional launch gate: REQUIRE_LIVE_INTEGRATIONS=1 (credentials present != verified).
 */
const rawBase = process.env.PROD_SMOKE_BASE_URL ?? ''
if (!rawBase) {
  console.error('PROD_SMOKE_BASE_URL is required (e.g. https://events.example.com/api/v1)')
  process.exit(2)
}
const base = new URL(rawBase.replace(/[/]$/, '') + '/')
const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
if (base.protocol !== 'https:' && !(loopback && base.protocol === 'http:')) {
  console.error('Refusing an insecure remote production smoke URL. Use HTTPS.')
  process.exit(2)
}
if (!base.pathname.endsWith('/api/v1/')) {
  console.error('PROD_SMOKE_BASE_URL must end in /api/v1')
  process.exit(2)
}

async function getJson(path: string): Promise<unknown> {
  const target = new URL(path, base)
  const res = await fetch(target, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`GET ${path} returned HTTP ${res.status}`)
  return await res.json()
}

interface Integration {
  key: string
  configured: boolean
  mode: string
}

async function main() {
  const health = await getJson('health') as {
    status?: string
    database?: string
    validation?: { errors?: string[] }
    integrations?: Integration[]
  }
  if (health.status !== 'healthy' || health.database !== 'up' || (health.validation?.errors?.length ?? 1) !== 0) {
    throw new Error('Production health check failed: database, status, or env validation')
  }
  const integrations = health.integrations ?? []
  for (const key of ['hubtel-checkout', 'hubtel-sms']) {
    const item = integrations.find((i) => i.key === key)
    if (!item || item.mode === 'simulated') throw new Error(`Unsafe provider state for ${key}`)
  }
  console.log('PASS health: app/database healthy, zero config errors, payment/SMS not simulated')
  await getJson('discovery/home')
  console.log('PASS public discovery: HTTP 200 with JSON')
  await getJson('openapi')
  console.log('PASS OpenAPI: HTTP 200 with JSON')

  if (process.env.REQUIRE_LIVE_INTEGRATIONS === '1') {
    const keys = ['hubtel-checkout', 'hubtel-sendmoney', 'hubtel-sms', 'cloudflare-stream', 'smtp-email']
    const missing = keys.filter((key) => {
      const item = integrations.find((i) => i.key === key)
      return !item?.configured || item.mode !== 'real'
    })
    if (missing.length) throw new Error(`Live integration credentials missing/unavailable: ${missing.join(', ')}`)
    console.log('PASS live integration configuration (NOT proof of provider verification)')
  }
  console.log('All read-only production checks passed.')
}
main().catch((err) => {
  console.error('Production smoke failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
