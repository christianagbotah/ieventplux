'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, PackageCheck, RefreshCw, ShieldCheck, Ticket, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { usePortal } from '../store'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { money } from '../format'

type Line = { id: string; qty: number; collectedQty: number; remaining: number; holdStatus: string; unitPriceMinor: number;
  product: { name: string; sku: string; variantLabel: string | null; imageUrl: string | null } }
type Receipt = { order: { reference: string; buyerName: string; status: string; paidAt: string | null;
  event: { id: string; title: string; status: string }; tickets: number; admitted: number },
  lines: Line[]; canCollect: boolean; warning: string | null; note: string }

/** A signed receipt QR is a way to find an order, not authorization to collect.
 * The API checks accepted staff membership and payment status on each action. */
export default function SouvenirCollectionView({ token }: { token?: string }) {
  const { user } = usePortal()
  const { toast } = useToast()
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<{ line: Line; qty: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const load = useCallback(async () => {
    if (!token || !user) return
    setBusy(true)
    setError('')
    try { setReceipt(await api.get<Receipt>(`/souvenir-collection/${encodeURIComponent(token)}`)) }
    catch (reason) {
      setReceipt(null)
      setError(reason instanceof ApiClientError ? reason.message : 'Receipt unavailable. Ask the event manager to check your access.')
    } finally { setBusy(false) }
  }, [token, user, revision])
  useEffect(() => { void load() }, [load])

  const findReference = async () => {
    if (!ref.trim()) return
    setBusy(true)
    setError('')
    try {
      const found = await api.get<{ token: string }>(`/souvenir-collection/lookup?reference=${encodeURIComponent(ref.trim().toUpperCase())}`)
      navigate(`/collection/${found.token}`)
    } catch (reason) {
      setError(reason instanceof ApiClientError ? reason.message : 'Receipt not found or you lack access.')
    } finally { setBusy(false) }
  }
  const confirm = async () => {
    if (!pending || !token || saving) return
    setSaving(true)
    try {
      const result = await api.post<{ collected: number; duplicate: boolean; remaining: number }>(`/souvenir-collection/${encodeURIComponent(token)}`, {
        orderItemId: pending.line.id, qty: pending.qty, clientActionId: crypto.randomUUID(),
      })
      setPending(null)
      toast({ title: result.duplicate ? 'Collection already recorded' : 'Collection confirmed',
        description: `${result.collected} item(s) recorded. Remaining quantity: ${result.remaining ?? 'see receipt'}.` })
      setRevision((current) => current + 1)
    } catch (reason) {
      toast({ title: 'Collection not confirmed', description: reason instanceof ApiClientError ? reason.message : 'Please retry or contact the organizer.', variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-5 sm:px-5 sm:py-8">
    <Button variant="ghost" size="sm" onClick={() => navigate('/organizer?tab=events')}><ArrowLeft className="mr-1.5 size-4" /> Organizer workspace</Button>
    <header className="rounded-2xl border bg-card p-4 sm:p-5"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary"><PackageCheck className="size-4" /> Event operations</p>
      <h1 className="mt-2 text-xl font-extrabold sm:text-2xl">Souvenir receipt & collection</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">An ordinary smartphone camera opens a receipt link. Only signed-in event staff can verify it. No item is collected until an authorized staff member explicitly confirms the quantity.</p>
    </header>
    {!user ? <Card><CardContent className="space-y-3 p-5"><p className="font-bold">Staff sign-in required</p><p className="text-sm text-muted-foreground">Sign in using your accepted organizer or check-in staff account, then reopen the customer's QR link. A receipt QR alone never authorizes collection.</p><Button onClick={() => navigate('/signin')}>Sign in as event staff</Button></CardContent></Card> : <>
      {!token && <Card><CardContent className="space-y-3 p-4 sm:p-5"><p className="text-sm font-bold">Look up a receipt number</p><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Receipt reference" value={ref} onChange={(event) => setRef(event.target.value.toUpperCase())} maxLength={64} placeholder="ORD-XXXXXXXX" className="min-h-11" /><Button className="min-h-11" disabled={!ref.trim() || busy} onClick={() => void findReference()}>Find receipt</Button></div><p className="text-xs text-muted-foreground">You can also scan a customer's receipt QR using your phone's normal Camera app. No barcode scanner is needed.</p></CardContent></Card>}
      {busy && <div role="status" className="flex items-center gap-2 rounded-xl bg-secondary p-3 text-sm"><Loader2 className="size-4 animate-spin" /> Loading secured receipt…</div>}
      {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {receipt && <>
        <Card className="rounded-2xl"><CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">Receipt {receipt.order.reference}<Badge variant={receipt.order.status === 'PAID' ? 'default' : 'destructive'}>{receipt.order.status}</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm"><p><span className="font-semibold">Event:</span> {receipt.order.event.title}</p><p><span className="font-semibold">Customer:</span> {receipt.order.buyerName}</p>
            <p><span className="font-semibold">Venue tickets:</span> {receipt.order.admitted} admitted of {receipt.order.tickets} issued — separately scanned</p>
            {receipt.warning && <p role="alert" className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-800 dark:text-amber-200">{receipt.warning}</p>}
            <p className="text-xs text-muted-foreground">{receipt.note}</p>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold">Items for collection</h2><Button variant="outline" size="sm" onClick={() => setRevision((current) => current + 1)}><RefreshCw className="mr-1.5 size-4" /> Refresh</Button></div>
        {receipt.lines.length === 0 && <p className="rounded-xl border bg-card p-4 text-sm">No souvenir items are included in this order.</p>}
        {receipt.lines.map((line) => <Card key={line.id} className="rounded-2xl"><CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-bold">{line.product.name}{line.product.variantLabel ? ` · ${line.product.variantLabel}` : ''}</p><p className="text-xs text-muted-foreground">SKU {line.product.sku} · {money(line.unitPriceMinor)} each</p></div>
            <Badge variant={line.remaining === 0 ? 'default' : 'outline'}>{line.remaining === 0 ? 'Collected' : line.collectedQty > 0 ? 'Partially collected' : 'Awaiting collection'}</Badge></div>
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-secondary/50 p-3 text-center text-sm"><div><p className="text-xs text-muted-foreground">Ordered</p><p className="font-bold">{line.qty}</p></div><div><p className="text-xs text-muted-foreground">Collected</p><p className="font-bold">{line.collectedQty}</p></div><div><p className="text-xs text-muted-foreground">Remaining</p><p className="font-bold">{line.remaining}</p></div></div>
          {receipt.canCollect && line.remaining > 0 && <Button className="min-h-11 w-full" onClick={() => setPending({ line, qty: line.remaining })}><ClipboardCheck className="mr-1.5 size-4" /> Confirm collection</Button>}
          {line.remaining === 0 && <p className="flex items-center gap-1.5 text-xs text-primary"><CheckCircle2 className="size-4" /> All items in this line have been collected</p>}
        </CardContent></Card>)}
        <p className="flex items-start gap-2 text-xs text-muted-foreground"><Ticket className="mt-0.5 size-4 shrink-0" /> Merchandise confirmation never changes ticket status. Admit attendees using the separate ticket check-in screen.</p>
      </>}
    </>}
    <Dialog open={Boolean(pending)} onOpenChange={(next) => { if (!next && !saving) setPending(null) }}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-sm"><DialogHeader><DialogTitle>Approve souvenir collection?</DialogTitle></DialogHeader>
        {pending && <div className="space-y-3"><p className="text-sm">Verify the customer's receipt and confirm the actual number of items handed over.</p>
          <p className="text-sm font-semibold">{pending.line.product.name} · {pending.line.product.variantLabel || pending.line.product.sku}</p>
          <label className="block text-xs font-semibold" htmlFor="collection-count">Quantity to hand over</label>
          <Input id="collection-count" type="number" inputMode="numeric" min={1} max={pending.line.remaining} value={pending.qty} onChange={(event) => setPending((current) => current ? { ...current, qty: Number(event.target.value) } : null)} />
          <p className="text-xs text-muted-foreground">This action is recorded against your staff account. It cannot be treated as venue admission.</p>
        </div>}
        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2"><Button variant="outline" className="min-h-11" disabled={saving} onClick={() => setPending(null)}><XCircle className="mr-1.5 size-4" /> Cancel</Button>
          <Button className="min-h-11" disabled={saving || !pending || !Number.isSafeInteger(pending.qty) || pending.qty < 1 || pending.qty > pending.line.remaining} onClick={() => void confirm()}>{saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <ShieldCheck className="mr-1.5 size-4" />} Confirm</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
