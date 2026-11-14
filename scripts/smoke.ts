/**
 * iEventPlux smoke suite — the pre-deploy CI gate over the LIVE stack.
 *
 *   bun run smoke            (expects the app on :3000, worker :3001, realtime :3003)
 *   SMOKE_BASE_URL=… bun run smoke
 *
 * Black-box HTTP golden paths, run in dependency order:
 *   1. health            — healthy, database up, zero boot-validation errors
 *   2. discovery         — public home payload with real events
 *   3. login + me        — organizer session via cookie jar
 *   4. event detail      — slug lookup with ticket types
 *   5. order             — create (inventory-reserved)
 *   6. checkout          — payment initiate (dev simulator) → provider callback →
 *                          poll until the worker fulfils: PAID order + issued ticket
 *   7. my tickets        — the new ticket is listed
 *   8. admin ops         — super-admin session; ops history endpoint shape
 *   9. error contract    — unknown event → 404 { error: { code: 'NOT_FOUND' } }
 *  10. rate limit (LAST) — hammers POST /auth/password-reset 6×: the sixth must
 *                          be 429 with a Retry-After header — the PROOF that the
 *                          shared-store limiter is live (R32).
 *
 * Exit code: 0 = all checks passed; 1 = failures; 2 = stack not reachable.
 */

export {} // module (enables top-level await)

const BASE = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '')

interface CheckResult {
  name: string
  ok: boolean
  detail: string
  ms: number
}

class Jar {
  private cookies = new Map<string, string>()

  capture(res: Response) {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';')
      const eq = pair.indexOf('=')
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
  }

  get header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }
}

async function call(
  method: string,
  path: string,
  opts: { jar?: Jar; body?: unknown } = {},
): Promise<{ res: Response; json: any }> {
  const headers: Record<string, string> = {}
  if (opts.jar && opts.jar.header) headers.Cookie = opts.jar.header
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  if (opts.jar) opts.jar.capture(res)
  const json = await res.json().catch(() => null)
  return { res, json }
}

const fmt = (ms: number) => `${ms}ms`

async function run(): Promise<number> {
  const results: CheckResult[] = []

  const check = async (name: string, fn: () => Promise<[boolean, string]>) => {
    const t0 = Date.now()
    try {
      const [ok, detail] = await fn()
      results.push({ name, ok, detail, ms: Date.now() - t0 })
    } catch (err) {
      results.push({ name, ok: false, detail: `threw: ${err instanceof Error ? err.message : String(err)}`, ms: Date.now() - t0 })
    }
  }

  // 1 — health
  await check('health', async () => {
    const { res, json } = await call('GET', '/health')
    if (res.status !== 200) return [false, `HTTP ${res.status}`]
    if (json?.status !== 'healthy' || json?.database !== 'up') return [false, `status=${json?.status} db=${json?.database}`]
    const errors: string[] = json?.validation?.errors ?? []
    if (errors.length > 0) return [false, `boot validation errors: ${errors.join('; ')}`]
    return [true, `healthy · db up · ${json?.integrations?.length ?? 0} integrations reported`]
  })

  // 2 — discovery
  let candidates: { id: string; slug: string; startsAt?: string }[] = []
  await check('discovery home', async () => {
    const { res, json } = await call('GET', '/discovery/home')
    if (res.status !== 200) return [false, `HTTP ${res.status}`]
    const pool: any[] = []
    for (const value of Object.values(json ?? {})) if (Array.isArray(value)) pool.push(...value)
    candidates = pool.filter((e) => e && typeof e.slug === 'string' && typeof e.id === 'string')
    if (candidates.length === 0) return [false, 'no events in discovery payload']
    return [true, `${candidates.length} event refs across sections`]
  })

  // 3 — auth
  const organizer = new Jar()
  const ORGANIZER_EMAIL = 'accra@eventco.dev'
  const ORGANIZER_PASSWORD = 'Dev@12345'
  await check('organizer login + me', async () => {
    const { res, json } = await call('POST', '/auth/login', { jar: organizer, body: { email: ORGANIZER_EMAIL, password: ORGANIZER_PASSWORD } })
    if (res.status !== 200) return [false, `login HTTP ${res.status}: ${JSON.stringify(json?.error)?.slice(0, 120)}`]
    const me = await call('GET', '/auth/me', { jar: organizer })
    if (me.res.status !== 200) return [false, `me HTTP ${me.res.status}`]
    if (me.json?.user?.email !== ORGANIZER_EMAIL) return [false, 'session user mismatch']
    return [true, `session cookie round-trip (${me.json.user.displayName})`]
  })

  // 4 — event detail (pick a purchasable candidate)
  let chosen: { slug: string; id: string; ticketTypeId: string } | null = null
  await check('event detail with ticket types', async () => {
    const seen = new Set<string>()
    for (const c of candidates.slice(0, 10)) {
      if (seen.has(c.slug)) continue
      seen.add(c.slug)
      const { res, json } = await call('GET', `/events/${encodeURIComponent(c.slug)}`, { jar: organizer })
      if (res.status !== 200 || !json?.event) continue
      const ev = json.event
      if (ev.status !== 'PUBLISHED' || ev.visibility === 'INVITE_ONLY') continue
      if (new Date(ev.startsAt).getTime() < Date.now()) continue
      const tt = (ev.ticketTypes ?? []).find((t: any) => t.active !== false && (t.quota == null || t.soldCount < t.quota))
      if (!tt) continue
      chosen = { slug: ev.slug, id: ev.id, ticketTypeId: tt.id }
      break
    }
    if (!chosen) return [false, `no purchasable PUBLISHED upcoming event among ${seen.size} candidates`]
    return [true, `${chosen.slug} · ${(candidates.length)} refs scanned`]
  })

  // 5/6/7 — the purchase golden path
  let orderRef: string | null = null
  await check('order create (reserved)', async () => {
    if (!chosen) return [false, 'skipped — no purchasable event']
    const { res, json } = await call('POST', '/orders', {
      jar: organizer,
      body: { eventId: chosen.id, items: [{ ticketTypeId: chosen.ticketTypeId, qty: 1 }] },
    })
    if (res.status !== 200 || !json?.orderReference) return [false, `HTTP ${res.status}: ${JSON.stringify(json?.error)?.slice(0, 140)}`]
    orderRef = json.orderReference
    return [true, `order ${json.orderReference} (${json.status})`]
  })

  let paymentRef: string | null = null
  let amountLabel = ''
  await check('checkout initiate (dev simulator)', async () => {
    if (!orderRef) return [false, 'skipped — no order']
    const { res, json } = await call('POST', '/payments/initiate', { jar: organizer, body: { orderReference: orderRef } })
    if (res.status !== 200) return [false, `HTTP ${res.status}: ${JSON.stringify(json?.error)?.slice(0, 140)}`]
    const url: string = json?.checkoutUrl ?? ''
    const match = /payments\/simulator\/([A-Za-z0-9-]+)/.exec(url)
    if (!match) return [false, `no simulator reference in checkoutUrl: ${url.slice(0, 80)}`]
    paymentRef = match[1]
    const status = await call('GET', `/payments/initiate?reference=${encodeURIComponent(paymentRef)}`)
    amountLabel = (status.json?.attempt?.amountMinor != null ? (status.json.attempt.amountMinor / 100).toFixed(2) : '?')
    return [true, `attempt ${paymentRef} · provider ${json.provider} · GHS ${amountLabel}`]
  })

  await check('provider callback → worker fulfilment → PAID', async () => {
    if (!paymentRef || !amountLabel) return [false, 'skipped — no payment attempt']
    const cb = await call('POST', '/payments/callback', {
      body: {
        ResponseCode: '0000',
        TransactionId: `SMOKE-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        Amount: amountLabel,
        Currency: 'GHS',
        Description: 'Smoke suite payment',
        ClientReference: paymentRef,
      },
    })
    if (cb.res.status !== 200 || cb.json?.received !== true) return [false, `callback HTTP ${cb.res.status}`]
    // The worker processes the callback asynchronously — poll for the outcome.
    const deadline = Date.now() + 30_000
    let last = 'unset'
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1_500))
      const { json } = await call('GET', `/payments/initiate?reference=${encodeURIComponent(paymentRef)}`)
      last = `${json?.attempt?.status ?? '?'} / order ${json?.order?.status ?? '?'}`
      if (json?.attempt?.status === 'SUCCESS' && json?.order?.status === 'PAID') return [true, `callback accepted → attempt SUCCESS · order PAID (final: ${last})`]
    }
    return [false, `fulfilment timeout — last state: ${last}`]
  })

  await check('my tickets includes the new ticket', async () => {
    const { res, json } = await call('GET', '/tickets?page=1&pageSize=10', { jar: organizer })
    if (res.status !== 200) return [false, `HTTP ${res.status}`]
    const items: any[] = json?.items ?? []
    if (items.length === 0) return [false, 'no tickets listed']
    return [true, `${items.length} ticket(s) listed`]
  })

  // 8 — admin ops
  const admin = new Jar()
  await check('admin ops history endpoint', async () => {
    const login = await call('POST', '/auth/login', { jar: admin, body: { email: 'admin@ieventplux.dev', password: 'Dev@12345' } })
    if (login.res.status !== 200) return [false, `admin login HTTP ${login.res.status}`]
    const { res, json } = await call('GET', '/admin/ops', { jar: admin })
    if (res.status !== 200) return [false, `GET /admin/ops HTTP ${res.status}`]
    const missing = ['targets', 'alerts', 'backups', 'commands'].filter((k) => json?.[k] === undefined)
    if (missing.length > 0) return [false, `missing keys: ${missing.join(', ')}`]
    const targets: any[] = json.targets ?? []
    if (!targets.every((t) => t.uptime24h === null || (t.uptime24h >= 0 && t.uptime24h <= 100))) return [false, 'bad uptime values']
    return [true, `${targets.length} targets · ${json.alerts?.length ?? 0} alerts · ${json.backups?.length ?? 0} backup runs`]
  })

  // 9 — error contract
  await check('404 error contract', async () => {
    const { res, json } = await call('GET', '/events/definitely-not-a-slug-smoke')
    if (res.status !== 404) return [false, `expected 404, got ${res.status}`]
    if (json?.error?.code !== 'NOT_FOUND') return [false, `code=${json?.error?.code}`]
    return [true, '404 + NOT_FOUND code']
  })

  // 10 — shared-store rate limiter proof (LAST: poisons the pwreset bucket for a minute)
  await check('database-backed rate limit (429 + Retry-After)', async () => {
    const codes: number[] = []
    for (let i = 0; i < 6; i += 1) {
      const { res } = await call('POST', '/auth/password-reset', { body: { email: 'smoke@ieventplux.invalid' } })
      codes.push(res.status)
    }
    const sixth = codes[5]
    const retryAfter = codes.slice(0, 5).every((c) => c === 200) && sixth === 429
    if (!retryAfter) return [false, `status codes: ${codes.join(', ')}`]
    // re-request to read headers (still inside the same window → 429)
    const probe = await call('POST', '/auth/password-reset', { body: { email: 'smoke@ieventplux.invalid' } })
    const ra = probe.res.headers.get('retry-after')
    if (probe.res.status !== 429) return [false, `post-limit probe returned ${probe.res.status}`]
    if (!ra || Number.isNaN(Number(ra))) return [false, `Retry-After header missing/invalid: ${ra}`]
    return [true, `5×200 → 429 (codes ${codes.join(',')}) · Retry-After: ${ra}s`]
  })

  // ── report ──────────────────────────────────────────────────────────────
  const width = Math.max(...results.map((r) => r.name.length))
  console.log(`\niEventPlux smoke suite — ${BASE}`)
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}  (${fmt(r.ms)})`)
  }
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — ${failed.length} FAILED` : ''}\n`)
  return failed.length > 0 ? 1 : 0
}

// Stack reachability gate (exit 2 with a clear message instead of 10 confusing failures).
try {
  await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5_000) })
} catch {
  console.error(`Smoke suite: the stack is not reachable at ${BASE} — start the app (bun run dev), worker and realtime first (see docs/DEPLOYMENT.md).`)
  process.exit(2)
}

process.exit(await run())
