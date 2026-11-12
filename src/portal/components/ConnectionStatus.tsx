'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'

/**
 * Connection resilience surface, two honest jobs:
 *
 * 1. Registers the conservative service worker (public/sw.js) — network-first
 *    for navigations and hot reads, cache-first only for static assets. A
 *    page-reload-on-controllerchange is applied exactly once so an activated
 *    worker takes over cleanly.
 *
 * 2. Renders the offline banner while the browser is offline, tracked through
 *    `useSyncExternalStore` (the React-native way to subscribe to online/offline
 *    — no effect-body setState, no hydration mismatch). The banner tells the
 *    truth: saved tickets keep their QR codes offline; anything that needs the
 *    network will simply say so when it fails.
 *
 * Round 17 hardening — deterministic SW-takeover reload: the controllerchange
 * listener now lives at MODULE scope (attached when the chunk evaluates, i.e.
 * BEFORE React hydration finishes) instead of inside an effect. An effect-based
 * listener can attach after a fast `skipWaiting()` takeover already fired the
 * event, stranding the page on a stale-chunk hydration — fresh server HTML
 * hydrated by previous-build chunks renders a different React tree and React
 * 19 reports radix `useId` attribute mismatches ("_R_18jatplb_" vs "_R_52eatplb_",
 * the round-17 user report). The `hadController` snapshot (read before any
 * takeover can land) keeps the very FIRST install in a fresh browser a no-op:
 * that page was served uncontrolled with fresh chunks, so reloading it would
 * only waste a load — a reload is justified exactly when control changes hands
 * over an already-served page, which is whenever new code must take over.
 */

let swReloaded = false
const hadController =
  typeof window !== 'undefined' && 'serviceWorker' in navigator
    ? navigator.serviceWorker.controller !== null
    : false

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swReloaded || !hadController) return
    swReloaded = true
    window.location.reload()
  })
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function ConnectionStatus() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
  const offline = !online

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const next = reg.installing
          next?.addEventListener('statechange', () => {
            if (next.state === 'installed' && navigator.serviceWorker.controller) {
              // Ask the waiting worker to take over now; the module-scope
              // controllerchange listener reloads the page exactly once.
              next.postMessage('SKIP_WAITING')
            }
          })
        })
      })
      .catch(() => {})
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      className="flex w-full items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>You&apos;re offline — saved tickets keep showing their QR codes. Actions that need the network will say so.</span>
    </div>
  )
}
