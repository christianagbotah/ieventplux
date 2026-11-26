/**
 * Session state — deliberately Zustand-free: React context + useState is
 * enough for the mobile surface (one signed-in user + their org memberships).
 * The web portal keeps its own store; this mirrors the auth/me payload only.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, type Membership, type User } from '../api/client'
import {AppState} from 'react-native'
import {setTextRetryOwner} from '../lib/direct-text-retry'
import {allowPushAccount,refreshPush,revokePushBeforeLogout} from '../lib/push-registration'

export type SessionStatus = 'restoring' | 'authenticated' | 'anonymous' | 'error'

export interface SessionContextValue {
  status: SessionStatus
  user: User | null
  memberships: Membership[]
  error: string | null
  /** Called after a successful /auth/login to adopt the fresh cookie session. */
  signIn: (user: User, memberships: Membership[]) => void
  /** Re-read /auth/me (cookie jar decides whether we are still signed in). */
  refresh: () => Promise<void>
  /** POST /auth/logout + reset local state (navigating back to Login is the caller's job). */
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('restoring')
  const [user, setUser] = useState<User | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await api.auth.me()
      if (res.user) {
        setTextRetryOwner(res.user.id)
        setUser(res.user)
        setMemberships(res.memberships ?? [])
        setStatus('authenticated')
      } else {
        setTextRetryOwner(null)
        setUser(null)
        setMemberships([])
        setStatus('anonymous')
      }
      setError(null)
    } catch (err) {
      // Transport/config failure — distinct from "signed out", surfaced in the UI.
      setStatus('error')
      setError(
        err instanceof Error ? err.message : 'Could not reach the iEventPlux API.'
      )
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signIn = useCallback((nextUser: User, nextMemberships: Membership[]) => {
    setTextRetryOwner(nextUser.id)
    setUser(nextUser)
    setMemberships(nextMemberships)
    setStatus('authenticated')
    setError(null)
  }, [])

  useEffect(()=>{
    if(status!=='authenticated'||!user?.id){allowPushAccount(null);return}
    const id=user.id
    allowPushAccount(id)
    void refreshPush(id).catch(()=>{})
    const sub=AppState.addEventListener('change',state=>{
      if(state==='active')void refreshPush(id).catch(()=>{})
    })
    const timer=setInterval(()=>{if(AppState.currentState==='active')void refreshPush(id).catch(()=>{})},6*60*60_000)
    return()=>{sub.remove();clearInterval(timer)}
  },[status,user?.id])

  const signOut = useCallback(async () => {
    setTextRetryOwner(null)
    try {
      if(user?.id)await revokePushBeforeLogout(user.id).catch(()=>{})

      await api.auth.logout()
    } catch {
      // Even if the network call fails, drop local state (cookie may be expired).
    }
    setUser(null)
    setMemberships([])
    setStatus('anonymous')
  }, [user])

  const value = useMemo<SessionContextValue>(
    () => ({ status, user, memberships, error, signIn, refresh, signOut }),
    [status, user, memberships, error, signIn, refresh, signOut]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>.')
  return ctx
}
