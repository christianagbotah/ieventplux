'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCheck, ClipboardCheck, Loader2, RefreshCw, RotateCcw, ShieldCheck, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api, ApiClientError } from '../api'
import { useToast } from '@/hooks/use-toast'

type IntakeRecord = {
  id: string; orderItemId: string; qty: number; condition: string; reason: string; evidenceNote: string
  status: string; createdAt: string; reviewedAt?: string | null; reviewNote?: string | null
  receivedBy: { displayName: string }; reviewedBy?: { displayName: string } | null
  orderItem: { order: { reference: string; buyerName: string }; product: { name: string; sku: string; variantLabel?: string | null } }
}

/** Authorized organizer staff may inspect custody records; only finance can
 * accept/reject evidence. No provider refund or stock restoration is possible. */
export function SouvenirReturnsInbox({ eventId, canReview }: { eventId: string; canReview: boolean }) {
  const { toast } = useToast()
  const [items, setItems] = useState<IntakeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<IntakeRecord | null>(null)
  const [decision, setDecision] = useState<'ACCEPTED' | 'REJECTED'>('ACCEPTED')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void api.get<{ items: IntakeRecord[] }>(`/souvenir-returns?eventId=${encodeURIComponent(eventId)}`)
      .then((res) => { if (!active) return; setItems(res.items); setError(''); setLoading(false) })
      .catch((err) => { if (!active) return; setError(err instanceof ApiClientError ? err.message : 'Could not retrieve return intake records.'); setLoading(false) })
    return () => { active = false }
  }, [eventId, revision])
  const refresh = () => { setLoading(true); setRevision((value) => value + 1) }
  const review = async () => {
    if (!selected || busy || note.trim().length < 10) return
    setBusy(true)
    try {
      const res = await api.post<{ status: string }>(`/souvenir-returns/${encodeURIComponent(selected.id)}/review`, { decision, note })
      toast({ title: res.status === 'ACCEPTED' ? 'Custody evidence verified' : 'Custody evidence rejected',
        description: 'Financial refund, inventory restocking and ticket rights have not changed.' })
      setSelected(null); setNote(''); refresh()
    } catch (err) {
      toast({ title: 'Return review could not be saved', variant: 'destructive', description: err instanceof ApiClientError ? err.message : 'Try again or refresh this record.' })
    } finally { setBusy(false) }
  }
  const pending = items.filter((item) => item.status === 'RECEIVED')
  return <section aria-labelledby="souvenir-returns-heading" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="souvenir-returns-heading" className="flex items-center gap-2 text-base font-bold"><RotateCcw className="size-5 text-primary" /> Returned merchandise</h3><p className="mt-1 text-xs text-muted-foreground">Physical custody evidence, not automatic refunds or restocking. Latest 50 intake records.</p></div>
      <Button variant="outline" size="sm" className="min-h-10" onClick={refresh} disabled={loading}><RefreshCw className="size-4" /> Refresh returns</Button>
    </div>
    {!loading && !error && pending.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs"><strong>{pending.length} return{pending.length === 1 ? '' : 's'} awaiting inspection.</strong> Finance must independently verify actual goods received. Neither decision moves money or inventory.</div>}
    {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading return records…</p>}
    {!loading && error && <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive"><AlertTriangle className="mr-2 inline size-4" />{error}</p>}
    {!loading && !error && items.length === 0 && <p className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">No physical returns recorded for this event.</p>}
    {!loading && !error && <div className="space-y-2">{items.map((record) => <article key={record.id} className="min-w-0 space-y-3 rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h4 className="break-words text-sm font-bold">{record.orderItem.product.name}{record.orderItem.product.variantLabel ? ` · ${record.orderItem.product.variantLabel}` : ''}</h4><p className="mt-1 text-[11px] text-muted-foreground">{record.orderItem.order.reference} · {record.orderItem.order.buyerName}</p></div>
        <Badge variant={record.status === 'RECEIVED' ? 'outline' : record.status === 'ACCEPTED' ? 'default' : 'secondary'}>{record.status === 'RECEIVED' ? 'Awaiting finance' : record.status === 'ACCEPTED' ? 'Custody verified' : 'Evidence rejected'}</Badge></div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs"><p><strong>Returned:</strong> {record.qty}</p><p><strong>Condition:</strong> {record.condition.toLowerCase()}</p></div>
      <div className="space-y-1 text-xs leading-relaxed"><p><strong>Reason:</strong> {record.reason}</p><p><strong>Evidence:</strong> {record.evidenceNote}</p><p className="text-muted-foreground">Received by {record.receivedBy.displayName} · {new Date(record.createdAt).toLocaleString()}</p>{record.reviewNote && <p><strong>Finance note:</strong> {record.reviewNote} {record.reviewedBy ? `(${record.reviewedBy.displayName})` : ''}</p>}</div>
      {canReview && record.status === 'RECEIVED' && <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2"><Button size="sm" className="min-h-10" variant="outline" onClick={() => { setSelected(record); setDecision('ACCEPTED'); setNote('') }}><CheckCheck className="mr-1.5 size-4" /> Verify received goods</Button><Button size="sm" className="min-h-10" variant="outline" onClick={() => { setSelected(record); setDecision('REJECTED'); setNote('') }}><XCircle className="mr-1.5 size-4" /> Reject evidence</Button></div>}
    </article>)}</div>}
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" /> Accepted return evidence proves physical custody only. Provider refund, financial reversal, ticket cancellation and resale inventory require independent reconciled workflows.</p>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !busy) setSelected(null) }}><DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-xl"><DialogHeader><DialogTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="size-5 text-primary" /> {decision === 'ACCEPTED' ? 'Verify physical return evidence' : 'Reject return evidence'}</DialogTitle></DialogHeader>
      {selected && <div className="space-y-3 text-sm"><p><strong>{selected.qty} × {selected.orderItem.product.name}</strong></p><p className="text-xs leading-relaxed text-muted-foreground">You must be a different finance-authorized person from the staff member who recorded receipt. This action does not approve a refund or alter saleable stock.</p>
        <label className="block space-y-1.5"><span className="text-xs font-bold">Factual finance review note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2" placeholder="Describe the physical evidence independently inspected (10+ characters)" /></label></div>}
      <DialogFooter className="gap-2"><Button variant="outline" disabled={busy} onClick={() => setSelected(null)}>Cancel</Button><Button disabled={busy || note.trim().length < 10} onClick={() => void review()}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}{decision === 'ACCEPTED' ? 'Verify custody only' : 'Reject evidence only'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>
}
