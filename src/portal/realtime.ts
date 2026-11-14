'use client'

import { io, type Socket } from 'socket.io-client'

/**
 * The public production gateway proxies /socket.io/* to realtime :3003.
 * Only the z.ai DEVELOPMENT preview needs the XTransformPort query.
 * Transport credentials are same-origin HttpOnly session cookies, never JS tokens.
 */
export function connectRealtime(): Socket {
  return io('/', {
    path: '/socket.io/',
    query: process.env.NODE_ENV !== 'production' ? { XTransformPort: '3003' } : undefined,
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 6,
    reconnectionDelay: 1200,
    timeout: 10000,
  })
}
