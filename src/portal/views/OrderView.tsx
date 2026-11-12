'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Clock, XCircle, AlertTriangle, Ticket, ChevronLeft, RefreshCw, CalendarPlus, RotateCw, HandCoins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'
import { money, dateLong, humanize, statusTone, relative } from '../format'
import { EmptyState } from '../components/EventCard'

interface SuggestionItem {
  slug: string
  title: string
  startsAt: string
  city: string | null
  mode: string
  orgName: string
  fromLabel: string
  reason: string
}

interface RefundCaseRow {
  id: string
  status: string
  type: string
  amountMinor: number
  reason: string
  resolutionNote?: string | null
  createdAt: string
  processedAt?: string | null
}

interface OrderPayload {
  order: {
    reference: string
    status: string
    kind: string
    userId?: string | null
    buyerName: string
    buyerEmail: string
    subtotalMinor: number
    discountMinor: number
    platformFeeMinor: number
    totalMinor: number
    totalLabel: string
    createdAt: string
    paidAt?: string | null
    expiresAt?: string | null
    event: { id: string; title: string; slug: string; startsAt: string; endsAt: string; timezone: string; coverImageUrl?: string | null; venue?: { name: string; city?: string | null } | null; org: { name: string } }
    items: { id: string; qty: number; unitPriceMinor: number; lineTotalMinor: number; ticketType: { name: string; kind: string } }[]
    tickets: { id: string; code: string; status: string; ticketTypeId: string }[]
    payments: { id: string; status: string; provider: string; attemptNo: number; reference: string }[]
    refundCases: RefundCaseRow[]
    exceptionReason?: string | null
  }
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PAID: <CheckCircle2 className="h-12 w-12 text-primary" aria-hidden />,
  PENDING_PAYMENT: <Clock className="h-12 w-12 text-amber-500" aria-hidden />,
  EXPIRED: <XCircle className="h-12 w-12 text-muted-foreground" aria-hidden />,
  CANCELLED: <XCircle className="h-12 w-12 text-muted-foreground" aria-hidden />,
  FAILED: <XCircle className="h-12 w-12 text-destructive" aria-hidden />,
  REFUNDED: <CheckCircle2 className="h-12 w-12 text-muted-foreground" aria-hidden />,
  REFUND_PENDING: <Clock className="h-12 w-12 text-amber-500" aria-hidden />,
  EXCEPTION_REVIEW: <AlertTriangle className="h-12 w-12 text-amber-500" aria-hidden />,
}

export default function OrderView({ reference }: { reference: string }) {
  const { toast } = useToast()
  const { user } = usePortal()
  const [data, setData] = useState<OrderPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [refundReason, setRefundReason] = useState('')
  const [refundBusy, setRefundBusy] = useState(false)
  // Round 14: DB-driven cross-sell shown once the order is settled.
  const [suggestions, setSuggestions] = useState<SuggestionItem[] | null>(null)
  // Mirrors the copy-success-checkmark animation; the real clipboard write happens in copyReference.
  const [refCopied, setRefCopied] = useState(false)

  // One-shot celebration when the order is confirmed (respects reduced motion).
  const celebratedRef = useRef(false)
  const isPaid = data?.order.status === 'PAID'
  useEffect(() => {
    if (!isPaid || celebratedRef.current) return
    celebratedRef.current = true
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    void import('canvas-confetti').then(({ default: confetti }) => {
      confetti({ particleCount: 90, spread: 75, origin: { y: 0.65 }, colors: ['#059669', '#f59e0b', '#ffffff'] })
      window.setTimeout(() => confetti({ particleCount: 55, angle: 60, spread: 60, origin: { x: 0, y: 0.8 } }), 260)
      window.setTimeout(() => confetti({ particleCount: 55, angle: 120, spread: 60, origin: { x: 1, y: 0.8 } }), 420)
    })
  }, [isPaid])

  useEffect(() => {
    if (!isPaid) return
    let alive = true
    void api
      .get<{ items: SuggestionItem[] }>(`/orders/${reference}/suggestions`)
      .then((res) => {
        if (alive) setSuggestions(res.items)
      })
      .catch(() => {
        if (alive) setSuggestions([])
      })
    return () => {
      alive = false
    }
  }, [isPaid, reference])

  const load = useCallback(async () => {
    try {
      const payload = await api.get<OrderPayload>(`/orders/${reference}`)
      setData(payload)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Order not found.')
    }
  }, [reference])

  useEffect(() => {
    void load()
  }, [load])

  // Poll while payment is in flight (browser return ≠ payment; the worker finalises state).
  useEffect(() => {
    if (!data || data.order.status !== 'PENDING_PAYMENT') return
    setPolling(true)
    const timer = setInterval(() => void load(), 3000)
    const stop = setTimeout(() => {
      setPolling(false)
      clearInterval(timer)
    }, 120_000)
    return () => {
      clearInterval(timer)
      clearTimeout(stop)
    }
  }, [data, load])

  const retryPayment = async () => {
    try {
      const payment = await api.post<{ checkoutUrl: string; provider: string }>('/payments/initiate', { orderReference: reference })
      window.location.href = payment.checkoutUrl
    } catch (err) {
      toast({ title: 'Payment unavailable', description: err instanceof ApiClientError ? err.message : 'Please try again.', variant: 'destructive' })
    }
  }

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference)
      setRefCopied(true)
      window.setTimeout(() => setRefCopied(false), 2600)
    } catch {
      /* clipboard unavailable */
    }
  }

  const requestRefund = async () => {
    setRefundBusy(true)
    try {
      await api.post(`/orders/${reference}/refund-request`, { reason: refundReason })
      toast({ title: 'Refund requested', description: 'The organizer has been notified and can now review your request.' })
      setRefundReason('')
      await load()
    } catch (err) {
      toast({ title: 'Request not sent', description: err instanceof ApiClientError ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setRefundBusy(false)
    }
  }

  if (error) {
    return <div className="mx-auto max-w-3xl px-4 py-16"><EmptyState title="Order unavailable" description={error} action={<Button className="rounded-full" onClick={() => navigate('/me?tab=orders')}>My orders</Button>} /></div>
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-4">
        <div className="ievx-skeleton h-24 rounded-2xl" />
        <div className="ievx-skeleton h-64 rounded-2xl" />
      </div>
    )
  }

  const { order } = data
  const ticketCount = order.items.reduce((s, i) => s + i.qty, 0)
  // Refund self-service rails: the signed-in buyer of an upcoming event, with
  // no case already open (one open case per order, server-enforced too).
  const isBuyer = Boolean(user && order.userId && user.id === order.userId)
  const eventEnded = Boolean(order.event.endsAt && new Date(order.event.endsAt) <= new Date())
  const openCase = order.refundCases.find((c) => ['REQUESTED', 'APPROVED'].includes(c.status))
  const canRequestRefund = isBuyer && !eventEnded && !openCase && ['PAID', 'EXCEPTION_REVIEW', 'PARTIALLY_REFUNDED'].includes(order.status)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 rounded-full text-muted-foreground" onClick={() => navigate('/me?tab=orders')}>
        <ChevronLeft className="h-4 w-4" /> My orders
      </Button>

      <Card className="overflow-hidden rounded-2xl">
        <div className={`flex flex-col items-center gap-3 px-6 py-8 text-center ${isPaid ? 'bg-primary/5' : order.status === 'EXCEPTION_REVIEW' ? 'bg-amber-500/5' : 'bg-secondary/50'}`}>
          {STATUS_ICONS[order.status] ?? <Clock className="h-12 w-12 text-muted-foreground" aria-hidden />}
          <div>
            <h1 className="text-xl font-extrabold">
              {isPaid && (order.kind === 'FREE' ? 'RSVP confirmed' : 'Payment successful')}
              {order.status === 'PENDING_PAYMENT' && 'Awaiting payment'}
              {order.status === 'EXPIRED' && 'Order expired'}
              {order.status === 'REFUND_PENDING' && 'Refund in progress'}
              {order.status === 'REFUNDED' && 'Refunded'}
              {order.status === 'EXCEPTION_REVIEW' && 'Payment under review'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Order <span className="font-mono font-semibold">{order.reference}</span> · {dateLong(order.createdAt)}
            </p>
            <label className="efx-copy-success-checkmark" style={{ margin: '0.75rem 0 0' }} onClick={() => void copyReference()}>
              <input className="efx-copy-success-checkmark__input" type="checkbox" checked={refCopied} onChange={() => {}} aria-label="Copy order reference" />
              <span className="efx-copy-success-checkmark__button">
                <span className="efx-copy-success-checkmark__badge" aria-hidden="true">
                  <svg className="efx-copy-success-checkmark__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path className="efx-copy-success-checkmark__path" d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <span className="efx-copy-success-checkmark__text">
                  <span className="efx-copy-success-checkmark__text-copy">Copy reference</span>
                  <span className="efx-copy-success-checkmark__text-done">Copied!</span>
                </span>
              </span>
            </label>
            {polling && (
              <div className="mt-2 flex items-center justify-center gap-3" role="status" aria-label="Waiting for payment confirmation">
                <span className="efx-pie-spinner shrink-0" aria-hidden="true" style={{ width: '44px', height: '44px', margin: 0 }} />
                <p className="text-xs font-medium text-primary">Listening for the payment confirmation…</p>
              </div>
            )}
            {order.exceptionReason && <p className="mt-2 max-w-md text-xs text-amber-700">{order.exceptionReason}</p>}
          </div>
          <Badge variant={statusTone(order.status) === 'success' ? 'default' : 'secondary'} className={`capitalize${order.status === 'PENDING_PAYMENT' ? ' relative' : ''}`}>
            {humanize(order.status)}
            {order.status === 'PENDING_PAYMENT' && <span className="efx-badge-ping__ping" aria-hidden="true" style={{ top: 3, right: 3, width: 6, height: 6 }} />}
          </Badge>
        </div>

        <CardContent className="space-y-6 p-6">
          <button className="flex w-full items-center gap-4 rounded-xl border border-border/70 p-4 text-left ievx-card-hover" onClick={() => navigate(`/event/${order.event.slug}`)}>
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
              {order.event.coverImageUrl && (
                <img src={order.event.coverImageUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">{order.event.title}</p>
              <p className="text-xs text-muted-foreground">{order.event.org.name} · {dateLong(order.event.startsAt, order.event.timezone)}</p>
              {order.event.venue && <p className="text-xs text-muted-foreground">{order.event.venue.name}</p>}
            </div>
            <a
              href={`/api/v1/events/${order.event.id}/ics`}
              download
              className="efx-underline-slide-link flex shrink-0 flex-col items-center gap-1 self-center px-2 text-xs font-semibold text-primary"
              aria-label="Add this event to your calendar (downloads an .ics file)"
              onClick={(e) => e.stopPropagation()}
            >
              <CalendarPlus className="h-5 w-5" aria-hidden />
              Calendar
            </a>
          </button>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Items</p>
            <div className="space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{item.ticketType.name} × {item.qty}</p>
                    <p className="text-xs text-muted-foreground capitalize">{humanize(item.ticketType.kind)}</p>
                  </div>
                  <p className="font-semibold">{item.unitPriceMinor === 0 ? 'Free' : money(item.lineTotalMinor)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
              {order.discountMinor > 0 && (
                <div className="flex justify-between text-muted-foreground"><span>Discounts</span><span>−{money(order.discountMinor)}</span></div>
              )}
              <div className="flex justify-between text-base font-extrabold">
                <span>Total</span>
                <span className="text-primary">{order.totalLabel}</span>
              </div>
            </div>
          </div>

          {order.status === 'PENDING_PAYMENT' && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm text-amber-800">
                {order.expiresAt && new Date(order.expiresAt) > new Date()
                  ? `Tickets are held until ${new Date(order.expiresAt).toLocaleTimeString()} — complete the payment to confirm them.`
                  : 'The ticket hold has expired. You can retry below if capacity remains.'}
              </p>
              <Button className="rounded-full ievx-press" onClick={() => void retryPayment()}>
                <RefreshCw className="mr-1.5 h-4 w-4" /> Complete payment
              </Button>
            </div>
          )}

          {isPaid && ticketCount > 0 && (
            <div className="efx-glassmorphism-card" style={{ borderRadius: '1.25rem', padding: '1.5rem' }}>
              <div className="efx-glassmorphism-card__backdrop" aria-hidden="true" />
              <div className="efx-glassmorphism-card__panel">
                <p className="efx-glassmorphism-card__meta flex items-center gap-2 font-semibold">
                  <Ticket className="h-4 w-4 text-emerald-300" aria-hidden /> {ticketCount} ticket{ticketCount > 1 ? 's' : ''} issued
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {order.tickets.map((t) => <Badge key={t.id} variant="outline" className="font-mono text-[10px]" style={{ borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)' }}>{t.code}</Badge>)}
                </div>
                <Button className="mt-3 rounded-full ievx-press" onClick={() => navigate('/me?tab=tickets')}>View tickets & QR codes</Button>
              </div>
            </div>
          )}

          {/* Round 14: honest cross-sell — real upcoming events, same category or city first. */}
          {isPaid && suggestions && suggestions.length > 0 && (
            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarPlus className="h-4 w-4 text-primary" aria-hidden /> Because you're attending {order.event.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-3">
                  {suggestions.map((s) => (
                    <button
                      key={s.slug}
                      type="button"
                      onClick={() => navigate(`/event/${s.slug}`)}
                      className="group rounded-xl border border-border/70 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <p className="line-clamp-2 text-sm font-semibold group-hover:text-primary">{s.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{dateLong(s.startsAt)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px]">{s.fromLabel}</Badge>
                        {s.city && <Badge variant="outline" className="text-[10px]">{s.city}</Badge>}
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">{s.reason}</p>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">Real upcoming events matched on category and city — no paid placement, no invented picks.</p>
              </CardContent>
            </Card>
          )}

          {/* Refund lifecycle: buyer self-service request + honest decision timeline. */}
          {(canRequestRefund || openCase || order.refundCases.some((c) => ['REJECTED', 'PROCESSED', 'MANUAL_TRACKED', 'FAILED'].includes(c.status))) && (
            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <HandCoins className="h-4 w-4 text-primary" aria-hidden /> Refund
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {canRequestRefund && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label htmlFor="refund-reason" className="text-sm font-medium">Something changed? Tell the organizer.</label>
                      <Textarea
                        id="refund-reason"
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        rows={3}
                        maxLength={500}
                        placeholder="e.g. I have a work rotation that weekend and cannot attend…"
                        aria-describedby="refund-reason-hint"
                      />
                      <p id="refund-reason-hint" className="text-[11px] text-muted-foreground">
                        The organizer reviews every request and can decline with a reason. Declined tickets stay valid — you keep your seats.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="outline"
                        className="rounded-full ievx-press"
                        disabled={refundBusy || refundReason.trim().length < 10}
                        onClick={() => void requestRefund()}
                      >
                        {refundBusy ? <span className="efx-dual-ring-loader" aria-hidden="true" style={{ width: 18, height: 18, margin: 0, borderWidth: 2 }} /> : <RotateCw className="mr-1.5 h-4 w-4" aria-hidden />}
                        Request refund · {money(order.totalMinor)}
                      </Button>
                      {refundBusy && (
                        <span className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">Sending request…</span>
                      )}
                    </div>
                  </div>
                )}

                {openCase && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                        {openCase.status === 'APPROVED' ? 'Refund approved — money reversal in progress' : 'Refund review in progress'}
                      </p>
                      <Badge variant="secondary" className="capitalize text-[9px]">{humanize(openCase.status)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Requested {relative(openCase.createdAt)} · {money(openCase.amountMinor)} — “{openCase.reason}”
                    </p>
                    {openCase.status === 'APPROVED' && (
                      <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                        The organizer approved this refund. The platform finance desk executes the mobile-money reversal — your tickets are held meanwhile.
                      </p>
                    )}
                  </div>
                )}

                {order.refundCases.filter((c) => c !== openCase).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Refund history</p>
                    {order.refundCases.filter((c) => c !== openCase).map((c) => (
                      <div key={c.id} className={`rounded-lg border px-3 py-2 text-xs ${c.status === 'REJECTED' ? 'border-border bg-secondary/40' : 'border-primary/20 bg-primary/5'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">{money(c.amountMinor)} · {humanize(c.type)}</span>
                          <span className="flex items-center gap-2">
                            {c.status === 'PROCESSED' && <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden />}
                            {c.status === 'REJECTED' && <XCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                            <Badge variant={statusTone(c.status) === 'success' ? 'default' : 'secondary'} className="capitalize text-[9px]">{humanize(c.status)}</Badge>
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">“{c.reason}” · {relative(c.createdAt)}</p>
                        {c.resolutionNote && (
                          <p className={`mt-1 ${c.status === 'REJECTED' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                            Organizer: “{c.resolutionNote}”
                          </p>
                        )}
                        {c.status === 'MANUAL_TRACKED' && (
                          <p className="mt-1 text-[11px] text-muted-foreground">Provider refund endpoint pending sandbox verification — tracked with evidence, never faked.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {order.payments.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Payment attempts</p>
              <div className="space-y-1.5">
                {order.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2 text-xs">
                    <span className="font-mono">{p.reference}</span>
                    <span className="flex items-center gap-2">
                      <Badge variant="outline">{p.provider === 'SIMULATOR' ? 'Dev simulator' : 'Hubtel'}</Badge>
                      <Badge variant={statusTone(p.status) === 'success' ? 'default' : 'secondary'} className="capitalize">{humanize(p.status)}</Badge>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Payment state updates only from provider callbacks / server reconciliation — the browser return alone never marks an order paid.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
