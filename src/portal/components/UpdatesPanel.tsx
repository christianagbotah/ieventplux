'use client'

import { useCallback, useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { Megaphone, BellRing, Trash2, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { api, ApiClientError } from '../api'
import { usePortal } from '../store'
import { relative } from '../format'
import { useToast } from '@/hooks/use-toast'

/**
 * Organizer updates — the event's operational voice, live.
 *
 * Data comes from the API (initial rows are passed in, then the panel owns a
 * full refetch). The :3003 relay pushes `update:new` / `update:removed` into
 * the `event:{id}` room so open pages update instantly; if the relay is
 * unavailable nothing is lost — the next visit sees the same rows.
 */

export interface UpdateItem {
  id: string
  title: string
  body: string
  important: boolean
  createdAt: string
}

export default function UpdatesPanel({
  eventId,
  canManage,
  orgName,
  initial,
}: {
  eventId: string
  canManage: boolean
  orgName: string
  initial: UpdateItem[]
}) {
  const { user } = usePortal()
  const { toast } = useToast()

  const [updates, setUpdates] = useState<UpdateItem[]>(initial)
  const [draft, setDraft] = useState({ title: '', body: '', important: false })
  const [posting, setPosting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [lastOwnPostId, setLastOwnPostId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const payload = await api.get<{ items: UpdateItem[] }>(`/events/${eventId}/updates`).catch(() => null)
    if (payload) setUpdates(payload.items)
  }, [eventId])

  useEffect(() => {
    void refresh()
    // Resilience: heal stripped-websocket proxies even without relay events.
    const timer = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(timer)
  }, [refresh])

  // Realtime deltas from the event room (best-effort; refresh() is the fallback).
  useEffect(() => {
    const socket = io('/?XTransformPort=3003', { transports: ['websocket', 'polling'], reconnection: true })
    socket.on('connect', () => socket.emit('join', { room: `event:${eventId}` }))
    socket.on('update:new', ({ update }: { update: UpdateItem }) => {
      if (!update) return
      setUpdates((prev) => (prev.some((u) => u.id === update.id) ? prev : [update, ...prev]))
      if (update.id !== lastOwnPostId) {
        toast({ title: update.important ? 'Important update posted' : 'New organizer update', description: update.title })
      }
    })
    socket.on('update:removed', ({ updateId }: { updateId: string }) => {
      setUpdates((prev) => prev.filter((u) => u.id !== updateId))
    })
    return () => {
      socket.disconnect()
    }
  }, [eventId, toast, lastOwnPostId, user?.id])

  const post = useCallback(async () => {
    setPosting(true)
    try {
      const payload = await api.post<{ update: UpdateItem; reach: { audience: number; notified: number; smsQueued: number } }>(
        `/events/${eventId}/updates`,
        draft,
      )
      setUpdates((prev) => (prev.some((u) => u.id === payload.update.id) ? prev : [payload.update, ...prev]))
      setLastOwnPostId(payload.update.id)
      setDraft({ title: '', body: '', important: false })
      const parts = [`${payload.reach.notified} people notified`]
      if (draft.important) parts.push(`${payload.reach.smsQueued} SMS queued`)
      toast({ title: 'Update posted', description: parts.join(' · ') })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not post the update.', variant: 'destructive' })
    } finally {
      setPosting(false)
    }
  }, [draft, eventId, toast])

  const remove = useCallback(async (updateId: string) => {
    setDeleting(updateId)
    try {
      await api.delete(`/events/${eventId}/updates/${updateId}`)
      setUpdates((prev) => prev.filter((u) => u.id !== updateId))
      toast({ description: 'Update removed.' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not remove the update.', variant: 'destructive' })
    } finally {
      setDeleting(null)
    }
  }, [eventId, toast])

  return (
    <Card className="rounded-2xl" id="updates">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4 text-primary" aria-hidden />
          Organizer updates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="rounded-xl border border-dashed bg-secondary/40 p-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor={`upd-title-${eventId}`}>Post an update</Label>
                <Input
                  id={`upd-title-${eventId}`}
                  value={draft.title}
                  maxLength={160}
                  placeholder="e.g. Doors open 30 minutes earlier"
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </div>
              <Textarea
                value={draft.body}
                maxLength={2000}
                placeholder="Details your attendees need to know…"
                aria-label="Update details"
                className="min-h-20"
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`upd-important-${eventId}`}
                    checked={draft.important}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, important: v }))}
                    aria-label="Mark as important"
                  />
                  <Label htmlFor={`upd-important-${eventId}`} className="text-xs text-muted-foreground">
                    Important — also send SMS to the audience
                  </Label>
                </div>
                <Button
                  size="sm"
                  onClick={() => void post()}
                  disabled={posting || draft.title.trim().length < 2 || draft.body.trim().length < 2}
                >
                  {posting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                  Post update
                </Button>
              </div>
            </div>
          </div>
        )}

        {updates.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            {canManage ? `No updates yet — post the first one to keep ${orgName}'s audience informed.` : `No updates from ${orgName} so far.`}
          </p>
        ) : (
          updates.map((u) => (
            <article
              key={u.id}
              className={`iefx-msg-in relative rounded-xl p-4 ${u.important ? 'border-l-2 border-destructive bg-destructive/5' : 'bg-secondary/50'}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{u.title}</p>
                  {u.important && (
                    <Badge variant="destructive" className="gap-1 py-0">
                      <BellRing className="h-3 w-3" aria-hidden />
                      Important
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{relative(u.createdAt)}</span>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full text-muted-foreground hover:text-destructive"
                      aria-label={`Remove update: ${u.title}`}
                      disabled={deleting === u.id}
                      onClick={() => void remove(u.id)}
                    >
                      {deleting === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-1 text-sm text-foreground/85">{u.body}</p>
            </article>
          ))
        )}
      </CardContent>
    </Card>
  )
}
