'use client'

import { useEffect, useState } from 'react'
import { Archive, CheckCheck, Clock3, Download, Package, RefreshCcw, ShoppingBag, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, ApiClientError } from '../api'
import { money } from '../format'

type EventOption = { id: string; title: string; startsAt: string; status: string }
type Product = {
  id: string; sku: string; name: string; variantLabel?: string | null; active: boolean
  stockTotal: number; stockReserved: number; stockSold: number; stockFulfilled: number
  availableQty: number; paidQty: number; collectedQty: number; outstandingQty: number; salesMinor: number | null
}
type Handover = {
  id: string; qty: number; createdAt: string; collector: string; reference: string; buyerName: string
  product: string; variant?: string | null; sku: string; orderStatus: string
}
type Report = {
  eventId: string | null; event: EventOption | null; events: EventOption[]
  totals: { paidOrders: number; paidQty: number; collectedQty: number; outstandingQty: number; reservedQty: number; stockQty: number; salesMinor: number | null }
  items: Product[]; recentCollections: Handover[]; shownProducts: number; totalProducts: number
}

/** Operational reconciliation: read-only, no handover/venue admission actions.
 * Authenticated server-side org membership and financial field redaction remain
 * authoritative; a role switch cannot reveal restricted amounts through the UI.
 */
export function MerchandiseReconciliationView({ orgId }: { orgId: string }) {
  const [selectedId, setSelectedId] = useState('')
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ctrl = new AbortController()
    const query = selectedId ? `?eventId=${encodeURIComponent(selectedId)}` : ''
    void api.get<Report>(`/orgs/${orgId}/merchandise${query}`, { signal: ctrl.signal })
      .then((result) => { if (!ctrl.signal.aborted) { setData(result); setLoading(false); setError('') } })
      .catch((reason) => {
        if (ctrl.signal.aborted) return
        setLoading(false)
        setError(reason instanceof ApiClientError ? reason.message : 'Could not load souvenir reconciliation. Please retry.')
      })
    return () => ctrl.abort()
  }, [orgId, selectedId, revision])

  const refresh = () => { setLoading(true); setRevision((v) => v + 1) }
  const selectEvent = (eventId: string) => { setSelectedId(eventId); setLoading(true); setData(null) }
  const eventId = selectedId || data?.eventId || ''
  const exportHref = eventId ? `/api/v1/orgs/${encodeURIComponent(orgId)}/merchandise?eventId=${encodeURIComponent(eventId)}&format=csv` : '#'

  return <section aria-label="Merchandise reconciliation" className="space-y-5">
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary"><ShoppingBag className="size-4" /> Event merchandising</div>
          <h2 className="mt-2 text-xl font-extrabold tracking-tight">Orders, stock and collection</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">Track paid souvenir orders, outstanding venue pickups and staff handovers. Ticket admission is a separate process. No unverified checkout is counted as paid.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="min-h-10 rounded-lg" variant="outline" onClick={refresh} disabled={loading}><RefreshCcw className="size-4" /> Refresh</Button>
          {eventId && !loading && <Button size="sm" variant="outline" className="min-h-10 rounded-lg" asChild><a href={exportHref}><Download className="size-4" /> Export CSV</a></Button>}
        </div>
      </div>
      <div className="mt-4 max-w-xl">
        <label htmlFor="merchandise-report-event" className="mb-1.5 block text-xs font-bold">Choose an event</label>
        <select id="merchandise-report-event" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" disabled={loading && !data} value={eventId} onChange={(e) => selectEvent(e.target.value)}>
          {!eventId && <option value="">Select an event</option>}
          {(data?.events ?? []).map((item) => <option key={item.id} value={item.id}>{item.title} ({item.status.toLowerCase()})</option>)}
        </select>
      </div>
    </div>

    {loading && <div aria-live="polite" className="space-y-3"><div className="ievx-skeleton h-24 rounded-xl" /><div className="ievx-skeleton h-44 rounded-xl" /></div>}
    {!loading && error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}<Button className="mt-3 block" size="sm" variant="outline" onClick={refresh}>Retry report</Button></div>}
    {!loading && !error && data && !data.eventId && <div className="rounded-xl border bg-card p-6 text-center"><Archive className="mx-auto mb-2 size-7 text-muted-foreground" /><p className="font-semibold">No event souvenir catalogue yet</p><p className="mt-1 text-xs text-muted-foreground">Add T-shirts or other souvenir variants in the event editor to start tracking orders and collection.</p></div>}
    {!loading && !error && data?.eventId && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Paid receipts', value: data.totals.paidOrders, Icon: Users, hint: 'Confirmed orders containing souvenirs' },
          { label: 'Paid items', value: data.totals.paidQty, Icon: ShoppingBag, hint: 'Verified paid merchandise units' },
          { label: 'Handed over', value: data.totals.collectedQty, Icon: CheckCheck, hint: 'Items collected at the venue' },
          { label: 'Outstanding pickups', value: data.totals.outstandingQty, Icon: Clock3, hint: 'Paid items not yet collected' },
        ].map(({ label, value, Icon, hint }) => <article key={label} className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2"><h3 className="text-xs font-semibold leading-snug text-muted-foreground">{label}</h3><Icon aria-hidden className="size-4 shrink-0 text-primary" /></div>
          <p className="mt-2 text-2xl font-extrabold tabular-nums">{value.toLocaleString()}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
        </article>)}
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-xs text-muted-foreground">
        <Package className="size-4 text-primary" /> <span>Total stock: <strong className="text-foreground">{data.totals.stockQty.toLocaleString()}</strong></span>
        <span>Reserved in unpaid checkout: <strong className="text-foreground">{data.totals.reservedQty.toLocaleString()}</strong></span>
        {data.totals.salesMinor !== null && <span>Paid merchandise sales: <strong className="text-foreground">{money(data.totals.salesMinor)}</strong></span>}
      </div>
      <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-bold">Product-level reconciliation</h3><Badge variant="outline">{data.shownProducts} of {data.totalProducts} variants</Badge></div>
        {data.totalProducts > data.shownProducts && <p className="text-xs text-amber-700 dark:text-amber-300">This view is capped at {data.shownProducts} products. Summary totals cover all variants in the event; export includes the displayed product rows only.</p>}
        {data.items.length === 0 && <p className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">No souvenir products are configured for this event.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{data.items.map((item) => <article key={item.id} className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="text-sm font-bold [overflow-wrap:anywhere]">{item.name}</h4>{item.variantLabel && <p className="text-xs text-muted-foreground">{item.variantLabel}</p>}<p className="text-[11px] text-muted-foreground">SKU: {item.sku}</p></div><Badge variant={item.active ? 'outline' : 'secondary'}>{item.active ? 'Active' : 'Inactive'}</Badge></div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3 text-xs"><div><span className="text-muted-foreground">Paid</span><p className="text-lg font-extrabold tabular-nums">{item.paidQty}</p></div><div><span className="text-muted-foreground">Collected</span><p className="text-lg font-extrabold tabular-nums">{item.collectedQty}</p></div><div><span className="text-muted-foreground">Awaiting pickup</span><p className="font-bold">{item.outstandingQty}</p></div><div><span className="text-muted-foreground">Available stock</span><p className="font-bold">{item.availableQty}</p></div></div>
          {item.salesMinor !== null && <p className="border-t pt-2 text-xs">Paid sales <strong>{money(item.salesMinor)}</strong></p>}
        </article>)}</div>
      </div>
      <div className="space-y-3"><div><h3 className="text-base font-bold">Recent staff handovers</h3><p className="mt-0.5 text-xs text-muted-foreground">Latest 35 confirmed handovers with staff and receipt reference. These remain recorded if an order subsequently enters refund review.</p></div>
        {data.recentCollections.length === 0 ? <p className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">No physical souvenir handovers recorded yet.</p>
          : <div className="space-y-2">{data.recentCollections.map((item) => <article key={item.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border bg-card p-3 text-xs">
            <div className="min-w-0"><h4 className="break-words font-bold">{item.product}{item.variant ? ` · ${item.variant}` : ''}</h4><p className="mt-1 text-muted-foreground">{item.reference} · {item.buyerName}</p><p className="mt-1 text-muted-foreground">By {item.collector} · {new Date(item.createdAt).toLocaleString()}</p></div><Badge variant="secondary" className="h-fit">{item.qty} collected</Badge>
          </article>)}</div>}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">Reporting is based on confirmed paid orders and persisted collection records, not payment requests or forecast estimates. Refund-pending and exception orders are excluded from available-to-collect totals; the stock counters remain visible for reconciliation.</p>
    </>}
  </section>
}
