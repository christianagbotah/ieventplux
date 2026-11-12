/*
 * iEventPlux service worker — deliberately conservative.
 *
 * Strategy (see docs/TEST_REPORT.md round 13):
 *  - Static immutable-style assets (`/_next/static/`, `/uploads/`, `/images/`,
 *    `/logo.svg`, manifest): cache-first — instant repeat visits, tolerant of
 *    flaky venue networks. Asset URLs are content-hashed, so a cached URL can
 *    never be logically stale.
 *  - Navigations + identity reads (`/api/v1/auth/me`): network-first with a
 *    cache fallback used ONLY on hard network failure — never on slowness.
 *    Serving a stale shell because the server was slow would run yesterday's
 *    app today (a real defect found and fixed in round-13 verification).
 *  - Wallet reads (`/api/v1/tickets*`, `/api/v1/orders*`): network-first with
 *    a 4 s race and cache fallback — resilience reads where brief staleness
 *    is harmless (the authoritative offline layer is the localStorage wallet).
 *  - Everything else: untouched. WebSockets are never intercepted.
 *
 * Dev-mode honesty: a fully offline cold boot of the shell is best-effort in
 * development (chunk sets shift between rebuilds). The offline ticket wallet
 * itself is client-side (localStorage) and does not depend on this worker.
 */

const VERSION = 'ievp-v2'
const SHELL_CACHE = `${VERSION}-shell`
const ASSET_CACHE = `${VERSION}-assets`
const API_CACHE = `${VERSION}-api`

const PRECACHE = ['/logo.svg', '/manifest.webmanifest', '/']

const WALLET_API = ['/api/v1/tickets', '/api/v1/orders']
const IDENTITY_API = ['/api/v1/auth/me']

function isWalletApi(url) {
  return WALLET_API.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))
}

function isIdentityApi(url) {
  return IDENTITY_API.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(undefined), ms))
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res && res.ok) cache.put(request, res.clone()).catch(() => {})
  return res
}

/**
 * Network-first. Slow-but-alive responses are always honoured; the cache is
 * consulted only when the network actually fails (or, for `raceMs`, when the
 * request is still unresolved after the budget expires).
 */
async function networkFirst(request, cacheName, { fallbackUrl = null, raceMs = null } = {}) {
  const cache = await caches.open(cacheName)
  try {
    const res = await (raceMs ? Promise.race([fetch(request), timeout(raceMs)]) : fetch(request))
    if (res) {
      if (res.ok) cache.put(request, res.clone()).catch(() => {})
      return res
    }
    throw new Error('network timeout')
  } catch (err) {
    const hit = await cache.match(request)
    if (hit) return hit
    if (fallbackUrl) {
      const shell = await cache.match(fallbackUrl)
      if (shell) return shell
    }
    throw err
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})))
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  if (req.headers.has('range')) return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (url.origin !== self.location.origin) return

  // Immutable-style static assets → cache-first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/images/') || url.pathname === '/logo.svg' || url.pathname === '/manifest.webmanifest') {
    event.respondWith(cacheFirst(req, ASSET_CACHE))
    return
  }

  // App navigations + identity → fresh or nothing; cache only rescues failure.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL_CACHE, { fallbackUrl: '/' }))
    return
  }
  if (isIdentityApi(url)) {
    event.respondWith(networkFirst(req, API_CACHE))
    return
  }

  // Wallet reads → bounded race, cache rescue on timeout/failure.
  if (isWalletApi(url)) {
    event.respondWith(networkFirst(req, API_CACHE, { raceMs: 4000 }))
  }
})
