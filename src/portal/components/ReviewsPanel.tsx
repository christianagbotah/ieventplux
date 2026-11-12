'use client'

import { useCallback, useEffect, useState } from 'react'
import { Star, Loader2, ShieldCheck, EyeOff, Eye, Pencil, BadgeCheck, MessageSquareQuote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'
import { relative, initials } from '../format'
import { useToast } from '@/hooks/use-toast'

/**
 * Post-event reviews with honest gating: aggregates count VISIBLE reviews only;
 * composing requires a fulfilled ticket on an ENDED event; one editable review
 * per attendee; organizers moderate (hide/restore).
 */

interface ReviewItem {
  id: string
  rating: number
  body: string | null
  status: string
  createdAt: string
  updatedAt: string
  author: { id: string; displayName: string }
  isMine: boolean
}

interface ReviewsPayload {
  aggregate: { average: number; count: number; distribution: { rating: number; count: number }[] }
  mine: { id: string; rating: number; body: string | null; status: string; updatedAt: string } | null
  eligibility: { eligible: boolean; reason: 'ENDED' | 'NOT_TICKET_HOLDER' | 'ELIGIBLE' } | null
  canModerate: boolean
  items: ReviewItem[]
}

const STARS = [1, 2, 3, 4, 5]

export function StarRow({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {STARS.map((s) => (
        <Star
          key={s}
          className={`${cls} ${s <= Math.round(value) ? 'fill-accent text-accent' : 'text-muted-foreground/40'}`}
        />
      ))}
    </span>
  )
}

export default function ReviewsPanel({ eventId }: { eventId: string }) {
  const { user } = usePortal()
  const { toast } = useToast()
  const [data, setData] = useState<ReviewsPayload | null>(null)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const payload = await api.get<ReviewsPayload>(`/events/${eventId}/reviews`).catch(() => null)
    setData(payload)
    if (payload?.mine) {
      setRating(payload.mine.rating)
      setDraft(payload.mine.body ?? '')
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load, user?.id])

  if (!data) {
    return (
      <Card className="rounded-2xl" aria-busy="true">
        <CardContent className="p-5 space-y-2.5">
          <div className="ievx-skeleton h-4 w-32 rounded-full" />
          <div className="ievx-skeleton h-3 w-full rounded" />
          <div className="ievx-skeleton h-3 w-3/4 rounded" />
        </CardContent>
      </Card>
    )
  }

  // Honest self-hide: nothing here until the event has at least one review
  // (or the viewer could plausibly create one).
  const couldEverReview = data.eligibility?.eligible || data.items.some((r) => r.isMine) || data.canModerate
  if (data.aggregate.count === 0 && !couldEverReview) return null

  const submit = async () => {
    if (!user) return navigate('/signin')
    if (rating < 1) return
    setBusy(true)
    try {
      const result = await api.post<{ created: boolean; note: string }>(`/events/${eventId}/reviews`, { rating, body: draft })
      toast({ title: result.created ? 'Review published' : 'Review updated', description: 'Verified attendee review — thank you!' })
      await load()
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not save the review.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const moderate = async (review: ReviewItem, action: 'hide' | 'unhide') => {
    try {
      await api.post(`/reviews/${review.id}/${action}`)
      await load()
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Action failed.', variant: 'destructive' })
    }
  }

  const { aggregate, items } = data
  const editing = Boolean(data.mine)

  return (
    <Card className="rounded-2xl" id="reviews">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2.5 text-base">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent" aria-hidden>
            <MessageSquareQuote className="h-4.5 w-4.5" />
          </span>
          Reviews
          {aggregate.count > 0 && (
            <span className="flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm">
              <Star className="h-4 w-4 fill-accent text-accent" aria-hidden />
              <span className="font-bold">{aggregate.average}</span>
              <span className="text-xs text-muted-foreground">· {aggregate.count} review{aggregate.count === 1 ? '' : 's'}</span>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {aggregate.count > 0 && (
          <div className="grid gap-4 rounded-2xl border border-border/60 bg-muted/30 p-4 sm:grid-cols-[140px_1fr]">
            <div className="flex flex-col items-center justify-center gap-1 text-center">
              <span className="ievx-gradient-text text-4xl font-extrabold leading-none" aria-hidden>{aggregate.average}</span>
              <StarRow value={aggregate.average} />
              <span className="text-xs text-muted-foreground">{aggregate.count} verified attendee{aggregate.count === 1 ? '' : 's'}</span>
            </div>
            <div className="space-y-1.5" aria-label="Rating distribution">
              {aggregate.distribution.map((row) => {
                const pct = aggregate.count > 0 ? Math.round((row.count / aggregate.count) * 100) : 0
                return (
                  <div key={row.rating} className="flex items-center gap-2 text-xs">
                    <span className="flex w-10 shrink-0 items-center gap-0.5 font-medium">{row.rating}<Star className="h-3 w-3 fill-accent text-accent" aria-hidden /></span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${row.rating} stars: ${pct}%`}>
                      <div
                        className={`ievx-poll-fill h-full rounded-full bg-gradient-to-r ${row.rating === Math.round(aggregate.average) ? 'from-accent via-amber-500 to-primary' : 'from-primary to-emerald-500'}`}
                        style={{ width: `${pct}%`, transition: 'width .5s cubic-bezier(.22,.8,.32,1)' }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">{row.count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Composer — visible to the eligible attendee (or as the edit form). */}
        {data.eligibility && (
          data.eligibility.eligible || editing ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <LabelRow editing={editing} />
              <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Your rating">
                {STARS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={rating === s}
                    aria-label={`${s} star${s === 1 ? '' : 's'}`}
                    onMouseEnter={() => setHoverRating(s)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(s)}
                    className="ievx-press rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Star className={`h-6 w-6 transition-colors ${s <= (hoverRating || rating) ? 'fill-accent text-accent scale-105' : 'text-muted-foreground/40'}`} aria-hidden />
                  </button>
                ))}
                <span className="ml-2 text-sm font-bold text-accent" aria-live="polite">{(hoverRating || rating) > 0 ? (hoverRating || rating) + '/5' : ''}</span>
              </div>
              <Textarea
                className="mt-2 min-h-[72px] rounded-xl"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 600))}
                placeholder={editing ? 'Update what you thought of this event…' : 'How was it? Share details that help other attendees (optional).'}
                aria-label="Review text"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground" aria-live="polite">{draft.length}/600</span>
                <Button size="sm" className="rounded-full ievx-press" disabled={busy || rating < 1} onClick={() => void submit()}>
                  {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Star className="mr-1.5 h-3.5 w-3.5" />}
                  {editing ? 'Update review' : 'Publish review'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
              {data.eligibility.reason === 'ENDED'
                ? 'Reviews open once the event has ended — check back after the final session.'
                : 'Only attendees with fulfilled tickets can review this event.'}
            </p>
          )
        )}

        {items.length > 0 && (
          <ul className="space-y-2.5" aria-label="Attendee reviews">
            {items.map((review) => (
              <li key={review.id} className={`iefx-msg-in rounded-2xl border bg-card p-4 ${review.status === 'HIDDEN' ? 'border-border/50 opacity-70' : 'border-border/70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden>
                      {initials(review.author.displayName)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold leading-none">{review.author.displayName}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <StarRow value={review.rating} size="sm" />
                        <span className="text-[11px] text-muted-foreground">{relative(review.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="gap-1 border-primary/40 text-[10px] text-primary">
                      <BadgeCheck className="h-3 w-3" /> Verified attendee
                    </Badge>
                    {review.status === 'HIDDEN' && <Badge variant="secondary" className="gap-1 text-[10px]"><EyeOff className="h-3 w-3" /> Hidden</Badge>}
                  </div>
                </div>
                {review.body && <p className="mt-2.5 text-sm leading-relaxed">{review.body}</p>}
                {review.isMine && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Pencil className="h-3 w-3" aria-hidden /> Your review — editable above.
                  </p>
                )}
                {data.canModerate && (
                  <div className="mt-2.5">
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => void moderate(review, review.status === 'HIDDEN' ? 'unhide' : 'hide')}>
                      {review.status === 'HIDDEN' ? <Eye className="mr-1 h-3.5 w-3.5" /> : <EyeOff className="mr-1 h-3.5 w-3.5" />}
                      {review.status === 'HIDDEN' ? 'Restore' : 'Hide'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {aggregate.count === 0 && <p className="text-xs text-muted-foreground">No public reviews yet — the first verified attendee review will appear here.</p>}
        {data.canModerate && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden /> Hidden reviews stay visible to you for moderation.</p>}
      </CardContent>
    </Card>
  )
}

function LabelRow({ editing }: { editing: boolean }) {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold">
      <Star className="h-4 w-4 text-accent" aria-hidden />
      {editing ? 'Edit your review' : 'Rate this event'}
      <span className="text-xs font-normal text-muted-foreground">— verified attendees only</span>
    </p>
  )
}
