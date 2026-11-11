'use client'

import { useEffect, useState } from 'react'
import { Ticket, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'
import { useToast } from '@/hooks/use-toast'

export default function ClaimTicket({ token }: { token: string }) {
  const { user, setUser } = usePortal()
  const { toast } = useToast()
  const [state, setState] = useState<'idle' | 'claiming' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!user || state !== 'idle') return
    setState('claiming')
    void (async () => {
      try {
        await api.post(`/tickets/transfer/${token}`)
        setState('done')
        toast({ title: 'Ticket claimed', description: 'It is now in My Tickets with your name on it.' })
      } catch (err) {
        setState('error')
        setMessage(err instanceof ApiClientError ? err.message : 'This transfer link is invalid or already claimed.')
      }
    })()
  }, [user, token, state, toast])

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="efx-glassmorphism-card" style={{ borderRadius: '1.25rem', padding: '1.5rem' }}>
          <div className="efx-glassmorphism-card__backdrop" aria-hidden="true" />
          <div className="efx-glassmorphism-card__panel text-center">
            <Ticket className="mx-auto h-12 w-12 text-emerald-300" aria-hidden />
            <h1 className="efx-glassmorphism-card__title" style={{ fontSize: '1.25rem', marginTop: '1rem' }}>A ticket is waiting for you</h1>
            <p className="efx-glassmorphism-card__meta">Sign in or create an account to claim this transferred ticket.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button type="button" className="efx-neon-pulse-button" style={{ fontSize: '0.95rem', padding: '0.7rem 1.6rem' }} onClick={() => navigate('/signin')}>Sign in</button>
              <Button variant="outline" className="rounded-full" onClick={() => navigate('/register')}>Create account</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <div className="efx-glassmorphism-card" style={{ borderRadius: '1.25rem', padding: '1.5rem' }}>
        <div className="efx-glassmorphism-card__backdrop" aria-hidden="true" />
        <div className="efx-glassmorphism-card__panel text-center">
          {state === 'claiming' || state === 'idle' ? (
            <>
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-emerald-300" aria-hidden />
              <h1 className="efx-glassmorphism-card__title" style={{ fontSize: '1.25rem', marginTop: '1rem' }}>Claiming your ticket…</h1>
            </>
          ) : state === 'done' ? (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-300" aria-hidden />
              <h1 className="efx-glassmorphism-card__title" style={{ fontSize: '1.25rem', marginTop: '1rem' }}>Ticket claimed!</h1>
              <p className="efx-glassmorphism-card__meta">The ticket now belongs to {user.displayName}.</p>
              <button type="button" className="efx-neon-pulse-button mt-6" style={{ fontSize: '0.95rem', padding: '0.7rem 1.6rem' }} onClick={() => navigate('/me?tab=tickets')}>View my tickets</button>
            </>
          ) : (
            <>
              <Ticket className="mx-auto h-12 w-12 text-white/70" aria-hidden />
              <h1 className="efx-glassmorphism-card__title" style={{ fontSize: '1.25rem', marginTop: '1rem' }}>Claim failed</h1>
              <p className="efx-glassmorphism-card__meta">{message}</p>
              <Button variant="outline" className="mt-6 rounded-full" onClick={() => navigate('/')}>Back to Discover</Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
