'use client'

/**
 * R28 — attendee invitation redemption (#/invite/{code}).
 * The complete guest journey for INVITE_ONLY events: see the invitation,
 * RSVP with a party size, and track the organizer's approval truthfully
 * (pending → approved/declined). Approved guests get the private address
 * and can order tickets; declined guests see an honest decline.
 */

import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock, Loader2, MapPin, Ticket, Users, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'
import { useToast } from '@/hooks/use-toast'
import { dateLong, humanize } from '../format'

interface InviteEvent {
  id: string
  title: string
  slug: string
  startsAt: string
  endsAt: string
  city: string | null
  coverImageUrl: string | null
  org: { name: string }
}

interface InvitationInfo {
  code: string
  displayName: string | null
  maxGuests: number
  guestsRemaining: number
  requireApproval: boolean
  event: InviteEvent
}

interface RsvpInfo {
  id: string
  status: string
  guests: number
  createdAt: string
  decidedAt: string | null
}

type Phase = 'loading' | 'error' | 'form' | 'submitting' | 'pending' | 'approved' | 'declined' | 'conflict'

export default function InviteRedeem({ code }: { code: string }) {
  const { user } = usePortal()
  const { toast } = useToast()
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null)
  const [rsvp, setRsvp] = useState<RsvpInfo | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [message, setMessage] = useState('')
  const [guests, setGuests] = useState(1)

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ invitation: InvitationInfo }>(`/invitations/${encodeURIComponent(code.toUpperCase())}`)
      setInvitation(data.invitation)
      setGuests(Math.min(1, data.invitation.guestsRemaining))
      if (user) {
        const mine = await api.get<{ rsvp: RsvpInfo | null }>(`/invitations/${encodeURIComponent(code.toUpperCase())}/rsvp`).catch(() => ({ rsvp: null }))
        setRsvp(mine.rsvp)
        if (mine.rsvp) {
          setPhase(mine.rsvp.status === 'PENDING' ? 'pending' : mine.rsvp.status === 'APPROVED' ? 'approved' : mine.rsvp.status === 'DECLINED' ? 'declined' : 'form')
          return
        }
      }
      setPhase('form')
    } catch (err) {
      setPhase('error')
      setMessage(err instanceof ApiClientError ? err.message : 'This invitation could not be loaded.')
    }
  }, [code, user])

  useEffect(() => {
    void (async () => { await load() })()
  }, [load])

  const submitRsvp = async () => {
    if (!invitation || !user) return
    setPhase('submitting')
    try {
      const result = await api.post<{ rsvp: RsvpInfo; approved: boolean; nextStep: string }>(`/invitations/${encodeURIComponent(code.toUpperCase())}`, { guests })
      setRsvp(result.rsvp)
      setPhase(result.approved ? 'approved' : 'pending')
      toast({
        title: result.approved ? 'RSVP confirmed' : 'RSVP sent for approval',
        description: result.approved
          ? 'Your place is confirmed — tickets are unlocked.'
          : 'The organizer will approve your attendance shortly.',
      })
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Could not submit your RSVP.'
      // Already-responded guests land here across devices; re-sync real state.
      if (err instanceof ApiClientError && (err.status === 409 || err.code === 'CONFLICT')) {
        setPhase('conflict')
        setMessage(msg)
        void load()
        return
      }
      setPhase('form')
      toast({ title: 'RSVP failed', description: msg, variant: 'destructive' })
    }
  }

  if (phase === 'loading' || !invitation) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="efx-glassmorphism-card" style={{ borderRadius: '1.25rem', padding: '1.5rem' }}>
          <div className="efx-glassmorphism-card__backdrop" aria-hidden="true" />
          <div className="efx-glassmorphism-card__panel text-center">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-emerald-300" aria-hidden />
            <h1 className="efx-glassmorphism-card__title" style={{ fontSize: '1.25rem', marginTop: '1rem' }}>Checking your invitation…</h1>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="efx-glassmorphism-card" style={{ borderRadius: '1.25rem', padding: '1.5rem' }}>
          <div className="efx-glassmorphism-card__backdrop" aria-hidden="true" />
          <div className="efx-glassmorphism-card__panel text-center">
            <XCircle className="mx-auto h-12 w-12 text-destructive" aria-hidden />
            <h1 className="efx-glassmorphism-card__title" style={{ fontSize: '1.25rem', marginTop: '1rem' }}>Invitation unavailable</h1>
            <p className="efx-glassmorphism-card__meta">{message}</p>
            <Button variant="outline" className="mt-6 rounded-full" onClick={() => navigate('/')}>Back to Discover</Button>
          </div>
        </div>
      </div>
    )
  }

  const eventCard = (
    <div className="overflow-hidden rounded-2xl border border-border/70">
      {invitation.event.coverImageUrl && (
        <img src={invitation.event.coverImageUrl} alt="" className="h-28 w-full object-cover" />
      )}
      <div className="space-y-1.5 p-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{invitation.event.org.name}</p>
        <p className="text-lg font-bold leading-tight">{invitation.event.title}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> {dateLong(invitation.event.startsAt)}</span>
          {invitation.event.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> {invitation.event.city}</span>}
        </p>
      </div>
    </div>
  )

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="efx-glassmorphism-card" style={{ borderRadius: '1.25rem', padding: '1.5rem' }}>
          <div className="efx-glassmorphism-card__backdrop" aria-hidden="true" />
          <div className="efx-glassmorphism-card__panel space-y-5 text-center">
            <Ticket className="mx-auto h-12 w-12 text-emerald-300" aria-hidden />
            <div>
              <h1 className="efx-glassmorphism-card__title" style={{ fontSize: '1.25rem' }}>You are invited</h1>
              <p className="efx-glassmorphism-card__meta">Sign in or create an account to RSVP with invitation code <span className="font-mono font-semibold">{invitation.code}</span>.</p>
            </div>
            {eventCard}
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="efx-neon-pulse-button" style={{ fontSize: '0.95rem', padding: '0.7rem 1.6rem' }} onClick={() => navigate('/signin')}>Sign in</button>
              <Button variant="outline" className="rounded-full" onClick={() => navigate('/register')}>Create account</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const pending = phase === 'pending' || (phase === 'conflict' && rsvp?.status === 'PENDING')

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-20">
      <div className="efx-glassmorphism-card" style={{ borderRadius: '1.25rem', padding: '1.5rem' }}>
        <div className="efx-glassmorphism-card__backdrop" aria-hidden="true" />
        <div className="efx-glassmorphism-card__panel space-y-5">
          {eventCard}

          {phase === 'form' || phase === 'submitting' || phase === 'conflict' ? (
            invitation.guestsRemaining <= 0 ? (
              // R28: exhausted codes describe themselves instead of dead-ending.
              <div className="space-y-2 text-center">
                <Users className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
                <p className="text-sm font-semibold">This invitation is fully used</p>
                <p className="text-xs text-muted-foreground">All {invitation.maxGuests} {invitation.maxGuests === 1 ? 'seat is' : 'seats are'} claimed. If a guest declines, a seat may open up.</p>
              </div>
            ) : (
            <>
              {phase === 'conflict' && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">{message}</p>
              )}
              <div className="text-center">
                <p className="text-sm font-semibold">Invitation <span className="font-mono">{invitation.code}</span>{invitation.displayName ? ` · for ${invitation.displayName}` : ''}</p>
                <p className="text-xs text-muted-foreground">
                  Up to {invitation.guestsRemaining} {invitation.guestsRemaining === 1 ? 'guest' : 'guests'} {invitation.guestsRemaining === 1 ? 'seat' : 'seats'} on this invitation.
                </p>
              </div>
              <div className="space-y-2" role="group" aria-label="Party size">
                <label htmlFor="invite-guests" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Users className="h-3.5 w-3.5" aria-hidden /> Party size (including you)
                </label>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="Remove a guest" disabled={guests <= 1} onClick={() => setGuests((g) => Math.max(1, g - 1))}>−</Button>
                  <span className="w-8 text-center text-lg font-extrabold" aria-live="polite">{guests}</span>
                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="Add a guest" disabled={guests >= invitation.guestsRemaining} onClick={() => setGuests((g) => Math.min(invitation.guestsRemaining, g + 1))}>+</Button>
                </div>
              </div>
              {invitation.requireApproval && (
                <p className="rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  This invitation requires approval — the organizer reviews your RSVP before your place is confirmed.
                </p>
              )}
              <button
                type="button"
                className="efx-neon-pulse-button w-full"
                style={phase === 'submitting' ? { opacity: 0.55, cursor: 'not-allowed', animation: 'none' } : undefined}
                disabled={phase === 'submitting'}
                onClick={() => void submitRsvp()}
              >
                {phase === 'submitting' ? 'Sending RSVP…' : 'Send RSVP'}
              </button>
            </>
            )
          ) : pending ? (
            <div className="space-y-3 text-center">
              <Clock className="mx-auto h-12 w-12 text-amber-400" aria-hidden />
              <div>
                <h1 className="text-lg font-bold">Awaiting approval</h1>
                <p className="text-sm text-muted-foreground">
                  Your RSVP for {rsvp?.guests ?? guests} {((rsvp?.guests ?? guests) === 1 ? 'guest' : 'guests')} {((rsvp?.guests ?? guests) === 1 ? 'is' : 'are')} with the organizer.
                  You will be notified here and by notification when they decide.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">The private address unlocks once you are approved.</p>
              <Button variant="outline" className="rounded-full" onClick={() => navigate('/')}>Back to Discover</Button>
            </div>
          ) : phase === 'approved' ? (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden />
              <div>
                <h1 className="text-lg font-bold">You are confirmed</h1>
                <p className="text-sm text-muted-foreground">
                  {rsvp?.guests ?? guests} {((rsvp?.guests ?? guests) === 1 ? 'place is' : 'places are')} confirmed for {user.displayName}.
                  The private address is now visible on the event page.
                </p>
              </div>
              <button type="button" className="efx-neon-pulse-button w-full" onClick={() => navigate(`/event/${invitation.event.slug}`)}>
                View event &amp; get tickets
              </button>
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <XCircle className="mx-auto h-12 w-12 text-destructive" aria-hidden />
              <div>
                <h1 className="text-lg font-bold">RSVP declined</h1>
                <p className="text-sm text-muted-foreground">
                  The organizer of {invitation.event.title} was unable to accommodate this RSVP.
                  {rsvp?.decidedAt ? ` Decided ${dateLong(rsvp.decidedAt)}.` : ''}
                </p>
              </div>
              <Button variant="outline" className="rounded-full" onClick={() => navigate('/')}>Back to Discover</Button>
            </div>
          )}

          {rsvp && rsvp.status !== 'PENDING' && phase !== 'form' && (
            <p className="text-center text-[11px] text-muted-foreground">RSVP {humanize(rsvp.status.toLowerCase())} · {dateLong(rsvp.decidedAt ?? rsvp.createdAt)}</p>
          )}
        </div>
      </div>
    </div>
  )
}
