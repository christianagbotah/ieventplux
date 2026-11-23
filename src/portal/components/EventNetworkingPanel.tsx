'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Loader2, ShieldCheck, UserPlus, UsersRound, UserRoundX, LockKeyhole, RefreshCw, Flag, Ban, MoreHorizontal } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useConfirm } from '@/components/ui/confirm-dialog-provider'
import { api, ApiClientError } from '../api'
import { initials } from '../format'
import { navigate } from '../router'
import { usePortal } from '../store'

type NetworkMember = {
  id: string
  displayName: string
  avatarUrl?: string | null
  following: boolean
  isMe: boolean
}
type NetworkResponse = {
  eligible: boolean
  optedIn: boolean
  items: NetworkMember[]
  hasMore: boolean
  nextCursor: string | null
}

/** An event participant is NEVER listed merely for buying a ticket or RSVP. */
export function EventNetworkingPanel({ eventId }: { eventId: string }) {
  const { user } = usePortal()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [followBusy, setFollowBusy] = useState<string | null>(null)
  const [eligible, setEligible] = useState(false)
  const [optedIn, setOptedIn] = useState(false)
  const [items, setItems] = useState<NetworkMember[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (cursor?: string) => {
    if (!user) {
      setLoading(false)
      return
    }
    try {
      const data = await api.get<NetworkResponse>(
        '/events/' + eventId + '/network' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
      )
      setEligible(data.eligible)
      setOptedIn(data.optedIn)
      setNextCursor(data.hasMore ? data.nextCursor : null)
      setItems((previous) => {
        if (!cursor) return data.items
        const seen = new Set(previous.map((member) => member.id))
        return [...previous, ...data.items.filter((member) => !seen.has(member.id))]
      })
      setError('')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Networking could not be loaded.')
    } finally { setLoading(false) }
  }, [eventId, user])

  useEffect(() => { void load() }, [load])

  const setConsent = async (join: boolean) => {
    if (!user || busy) return
    const accepted = await confirm(join ? {
      title: 'Join the attendee network?',
      description: 'Only other opted-in attendees with valid event access will see your display name and profile picture. Your email, phone and ticket details are never shown. You can leave at any time.',
      confirmLabel: 'Join network', tone: 'normal',
    } : {
      title: 'Leave the attendee network?',
      description: 'Your profile will disappear from this event directory immediately. Existing follows are separate and can be managed from your profile.',
      confirmLabel: 'Leave network', tone: 'warning',
    })
    if (!accepted) return
    setBusy(true)
    try {
      await api.post('/events/' + eventId + '/network', { action: join ? 'join' : 'leave' })
      await load()
      toast({ title: join ? 'You joined the attendee network' : 'Your profile is no longer listed' })
    } catch (err) {
      toast({ title: 'Could not update networking', description: err instanceof ApiClientError ? err.message : 'Please try again.', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const toggleFollow = async (member: NetworkMember) => {
    if (followBusy) return
    setFollowBusy(member.id)
    try {
      await api.post('/social/' + (member.following ? 'unfollow' : 'follow'), { userId: member.id })
      setItems((previous) => previous.map((row) => row.id === member.id
        ? { ...row, following: !row.following } : row))
      toast({ title: member.following ? 'Unfollowed' : 'Now following', description: member.displayName })
    } catch (err) {
      toast({ title: 'Could not update follow', description: err instanceof ApiClientError ? err.message : 'Please try again.', variant: 'destructive' })
    } finally { setFollowBusy(null) }
  }

  const protect = async (member: NetworkMember, kind: 'block' | 'report') => {
    const accepted = await confirm(kind === 'block' ? {
      title: 'Block this attendee?',
      description: 'You will not see each other in event networks or conversations. You can manage blocked accounts in your privacy settings.',
      confirmLabel: 'Block attendee', tone: 'danger',
    } : {
      title: 'Report this attendee?',
      description: 'A report will be sent to platform moderators for review. This does not automatically block the person.',
      confirmLabel: 'Submit report', tone: 'warning',
    })
    if (!accepted) return
    try {
      if (kind === 'block') {
        await api.post('/social/block', { userId: member.id })
        setItems((previous) => previous.filter((row) => row.id !== member.id))
        toast({ title: 'Attendee blocked' })
      } else {
        await api.post('/social/report', { targetType: 'USER', targetId: member.id, reason: 'OTHER' })
        toast({ title: 'Report submitted for review' })
      }
    } catch (err) {
      toast({ title: 'Unable to complete action', description: err instanceof ApiClientError ? err.message : 'Try again.', variant: 'destructive' })
    }
  }

  return <Card className="overflow-hidden rounded-2xl border-primary/20" id="event-networking">
    <CardHeader className="space-y-2 bg-primary/[0.04] pb-4">
      <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
        <UsersRound className="size-5 text-primary" aria-hidden /> Meet fellow attendees
      </CardTitle>
      <p className="text-sm leading-6 text-muted-foreground">
        Build your network beyond the event. You control whether your profile appears to other verified participants.
      </p>
    </CardHeader>
    <CardContent className="space-y-4 pt-5">
      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        Private by default. Only consenting, eligible attendees can view this directory. Email addresses, phone numbers and ticket records stay private.
      </p>

      {!user ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/40 p-4">
        <div className="flex items-center gap-2 text-sm"><LockKeyhole className="size-4 text-primary" aria-hidden /> Sign in to see whether you can join this event network.</div>
        <Button className="min-h-11 rounded-xl" onClick={() => navigate('/signin')}>Sign in</Button>
      </div> : loading && !items.length ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Checking your attendee access…</p>
      : error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm">
        <span>{error}</span>
        <Button variant="outline" className="min-h-11" onClick={() => { setLoading(true); void load() }}>Retry</Button>
      </div> : !eligible ? <div className="flex items-start gap-3 rounded-xl border bg-secondary/40 p-4">
        <LockKeyhole className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm font-semibold">Available to registered attendees</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">An approved RSVP for a free event, a valid event ticket, or an organizer role is required. Marking yourself “Going” alone does not grant access.</p>
        </div>
      </div> : <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-secondary/30 p-3 sm:p-4">
          <div className="flex items-center gap-2 text-sm">
            {optedIn ? <Check className="size-5 text-primary" aria-hidden /> : <UserRoundX className="size-5 text-muted-foreground" aria-hidden />}
            <span className="font-semibold">{optedIn ? 'Your profile is visible to opted-in attendees' : 'Your profile is hidden'}</span>
          </div>
          <Button type="button" variant={optedIn ? 'outline' : 'default'} className="min-h-11 rounded-xl"
            disabled={busy} onClick={() => void setConsent(!optedIn)}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : optedIn ? <UserRoundX className="size-4" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
            {optedIn ? 'Leave network' : 'Join network'}
          </Button>
        </div>
        {optedIn && <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">People open to connecting</h3>
            <Button type="button" variant="ghost" size="sm" className="min-h-10" disabled={loading}
              onClick={() => { setLoading(true); void load() }}><RefreshCw className={'size-4 ' + (loading ? 'animate-spin' : '')} aria-hidden /> Refresh</Button>
          </div>
          {items.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center">
            <UsersRound className="mx-auto mb-2 size-7 text-primary/60" aria-hidden />
            <p className="text-sm font-semibold">You are among the first people here</p>
            <p className="mt-1 text-xs text-muted-foreground">Other attendees will appear after they independently opt in.</p>
          </div> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((member) => <div key={member.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-card p-3">
              <Avatar className="size-11 shrink-0">
                {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
                <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{initials(member.displayName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold" title={member.displayName}>{member.displayName}</p>
                <p className="text-xs text-muted-foreground">{member.isMe ? 'You' : 'Event attendee'}</p>
              </div>
              {!member.isMe && <Button type="button" size="sm" variant={member.following ? 'outline' : 'default'}
                className="min-h-10 shrink-0 rounded-lg px-2.5 text-xs"
                disabled={followBusy === member.id} onClick={() => void toggleFollow(member)}>
                {followBusy === member.id ? <Loader2 className="size-3.5 animate-spin" /> : member.following ? <Check className="size-3.5" /> : <UserPlus className="size-3.5" />}
                {member.following ? 'Following' : 'Follow'}
              </Button>}
              {!member.isMe && <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-lg" aria-label={'Safety options for ' + member.displayName}>
                    <MoreHorizontal className="size-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuItem onSelect={() => void protect(member, 'report')}><Flag className="mr-2 size-4" aria-hidden /> Report profile</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void protect(member, 'block')} className="text-destructive"><Ban className="mr-2 size-4" aria-hidden /> Block profile</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>}
            </div>)}
          </div>}
          {nextCursor && <Button variant="outline" type="button" className="min-h-11 w-full rounded-xl"
            disabled={loading} onClick={() => { setLoading(true); void load(nextCursor) }}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <ChevronDown className="size-4" />} Find more attendees
          </Button>}
        </>}
      </>}
    </CardContent>
  </Card>
}
