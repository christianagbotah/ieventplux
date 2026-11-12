'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

/**
 * Connection resilience surface, two honest jobs:
 *
 * 1. Registers the conservative service worker (public/sw.js) — network-first
 *    for navigations and hot reads, cache-first only for static assets. A
 *    page-reload-on-controllerchange is applied exactly once so an activated
 *    worker takes over cleanly.
 *
 * 2. Renders the offline banner while `navigator.onLine` is false. The banner
 *    tells the truth: saved tickets keep their QR codes offline; anything that
 *    needs the network will simply say so when it fails.
 */
export function ConnectionStatus() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    setOffline(!navigator.onLine)
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)

    let reloaded = false
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            const next = reg.installing
            next?.addEventListener('statechange', () => {
              if (next.state === 'installed' && navigator.serviceWorker.controller && !reloaded) {
                reloaded = true
                next.postMessage('SKIP_WAITING')
              }
            })
          })
        })
        .catch(() => {})
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return
        reloaded = true
        window.location.reload()
      })
    }

    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
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
