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
        toast({ title: 'Ticket claimed 🎉', description: 'It is now in My Tickets with your name on it.' })
      } catch (err) {
        setState('error')
        setMessage(err instanceof ApiClientError ? err.message : 'This transfer link is invalid or already claimed.')
      }
    })()
  }, [user, token, state, toast])

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <Ticket className="mx-auto h-12 w-12 text-primary" aria-hidden />
        <h1 className="mt-4 text-xl font-bold">A ticket is waiting for you</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in or create an account to claim this transferred ticket.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button className="rounded-full" onClick={() => navigate('/signin')}>Sign in</Button>
          <Button variant="outline" className="rounded-full" onClick={() => navigate('/register')}>Create account</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      {state === 'claiming' || state === 'idle' ? (
        <>
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" aria-hidden />
          <h1 className="mt-4 text-xl font-bold">Claiming your ticket…</h1>
        </>
      ) : state === 'done' ? (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" aria-hidden />
          <h1 className="mt-4 text-xl font-bold">Ticket claimed!</h1>
          <p className="mt-2 text-sm text-muted-foreground">The ticket now belongs to {user.displayName}.</p>
          <Button className="mt-6 rounded-full" onClick={() => navigate('/me?tab=tickets')}>View my tickets</Button>
        </>
      ) : (
        <>
          <Ticket className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
          <h1 className="mt-4 text-xl font-bold">Claim failed</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          <Button className="mt-6 rounded-full" variant="outline" onClick={() => navigate('/')}>Back to Discover</Button>
        </>
      )}
    </div>
  )
}
