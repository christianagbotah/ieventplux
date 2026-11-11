'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Hash router for the single-route portal (the only user-visible page is /).
 * Routes: #/ #/live #/reels #/effects #/event/{slug} #/org/{slug} #/search
 *         #/signin #/register #/me #/checkout/{ref} #/order/{ref} #/claim/{token}
 *         #/organizer #/admin #/broadcast/{id} #/assistant #/create-org
 */
export interface Route {
  path: string
  segments: string[]
  query: URLSearchParams
  raw: string
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [pathPart, queryPart] = raw.split('?')
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`
  return {
    raw,
    path,
    segments: path.split('/').filter(Boolean),
    query: new URLSearchParams(queryPart ?? ''),
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => (typeof window === 'undefined' ? { path: '/', segments: [], query: new URLSearchParams(), raw: '/' } : parseHash()))

  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

export function navigate(to: string, options?: { replace?: boolean }) {
  const target = to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`
  if (options?.replace) {
    window.history.replaceState(null, '', target)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = target
  }
}

export function useNavigate() {
  return useCallback((to: string, options?: { replace?: boolean }) => navigate(to, options), [])
}
