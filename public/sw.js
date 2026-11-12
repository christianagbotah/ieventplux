/*
 * iEventPlux service worker — deliberately conservative.
 *
 * Strategy (see docs/TEST_REPORT.md round 13):
 *  - Static immutable-style assets (`/_next/static/`, `/uploads/`, `/images/`,
 *    `/logo.svg`, manifest): cache-first — instant repeat visits, tolerant of
 *    flaky venue networks.
 *  - Navigations + hot API reads (auth/me, tickets, orders): network-first
 *    with a 4 s race and cache fallback — the app keeps rendering on the last
 *    known data when the network dies mid-session (the real gate scenario).
 *  - Everything else: untouched (default browser behavior). WebSockets are
 *    never intercepted.
 *
 * Dev-mode honesty: Turbopack chunk URLs change on every rebuild, so a fully
 * offline cold boot of the shell is best-effort in development. The offline
 * ticket wallet itself is client-side (localStorage) and does not depend on
 * this worker once the app is open.
 */

const VERSION = 'ievp-v1'
const SHELL_CACHE = `${VERSION}-shell`
const ASSET_CACHE = `${VERSION}-assets`
const API_CACHE = `${VERSION}-api`

const PRECACHE = ['/logo.svg', '/manifest.webmanifest', '/']

const API_CACHEABLE = [
  '/api/v1/auth/me',
  '/api/v1/tickets',
  '/api/v1/orders',
]

const NETWORK_TIMEOUT_MS = 4000

function isCacheableApi(url) {
  const path = url.pathname
  if (!path.startsWith('/api/v1/')) return false
  return API_CACHEABLE.some((p) => path === p || path.startsWith(`${p}/`))
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

async function networkFirst(request, cacheName, { fallbackUrl = null } = {}) {
  const cache = await caches.open(cacheName)
  try {
    const res = await Promise.race([fetch(request), timeout(NETWORK_TIMEOUT_MS)])
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

  // App navigations → network-first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL_CACHE, { fallbackUrl: '/' }))
    return
  }

  // Hot identity/wallet reads → network-first with cache fallback.
  if (isCacheableApi(url)) {
    event.respondWith(networkFirst(req, API_CACHE))
  }
})
