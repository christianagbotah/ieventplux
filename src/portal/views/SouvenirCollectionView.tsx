'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, PackageCheck, RotateCcw, ShieldCheck, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api, ApiClientError } from '../api'
import { money, dateLong, humanize } from '../format'
import { navigate } from '../router'
import { usePortal } from '../store'
import { useToast } from '@/hooks/use-toast'
import { SouvenirReturnIntakeDialog } from '../components/SouvenirReturnIntakeDialog'

type CollectionLine = { id: string; qty: number; collectedQty: number; remaining: number; returnableQty: number; lineTotalMinor: number; holdStatus: string; product: { id: string; name: string; sku: string; variantLabel?: string | null } }
type Receipt = { id: string; eventId: string; reference: string; status: string; paidAt: string | null; buyerName: string; event: { title: string; startsAt: string; city?: string | null }; collectionEnabled: boolean; collectionAllowed: boolean; items: CollectionLine[] }

/** Mobile staff receipt lookup opened directly by any smartphone camera QR
 * reader. A signed URL only identifies the receipt; server login and org role
 * still gate every read and every individual collection. */
export default function SouvenirCollectionView({ token }: { token: string }) {
  const { user, booted } = usePortal()
  const { toast } = useToast()
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<CollectionLine | null>(null)
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [returning, setReturning] = useState<CollectionLine | null>(null)
  const load = useCallback(async () => {
    try {
      const result = await api.get<{ receipt: Receipt }>(`/souvenir-collection/${encodeURIComponent(token)}`)
      setReceipt(result.receipt); setError('')
    } catch (err) { setError(err instanceof ApiClientError ? err.message : 'Could not load this collection receipt.') }
    finally { setLoading(false) }
  }, [token])
  useEffect(() => { if (booted && user) void load(); else if (booted) setLoading(false) }, [user, booted, load])
  const confirmCollection = async () => {
    if (!selected || busy) return
    setBusy(true)
    try {
      // Client action id allows safe browser resubmission without duplicate stock movement.
      const result = await api.post<{ status: string }>(`/souvenir-collection/${encodeURIComponent(token)}`, {
        itemId: selected.id, qty, confirm: true, clientActionId: actionId,
      })
      toast({ title: result.status === 'ALREADY_RECORDED' ? 'Already recorded' : 'Souvenir collected', description: 'The handover is recorded. Ticket admission has not been changed.' })
      setSelected(null)
      setActionId(null)
      await load()
    } catch (err) { toast({ title: 'Cannot confirm handover', description: err instanceof ApiClientError ? err.message : 'Please retry.', variant: 'destructive' }) }
    finally { setBusy(false) }
  }
  return <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 pb-20">
    <div className="flex items-center justify-between gap-2"><Button variant="outline" size="sm" className="min-h-10" onClick={() => navigate('/collect')}>Scan another receipt</Button></div>
    <div className="flex items-center gap-3"><span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10"><PackageCheck className="size-6 text-primary" /></span><div className="min-w-0"><h1 className="text-xl font-extrabold">Souvenir collection desk</h1><p className="text-xs text-muted-foreground">Authorized staff only · QR scan opens receipt, not automatic collection</p></div></div>
    {!booted || loading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Verifying access and loading receipt…</p>
      : !user ? <Card className="rounded-xl"><CardContent className="space-y-3 p-5"><p className="text-sm">Sign in with your event staff account to inspect and confirm this receipt.</p><Button className="min-h-11 w-full" onClick={() => navigate(`/signin?next=${encodeURIComponent(`/collect/${token}`)}`)}>Staff sign in</Button></CardContent></Card>
      : error ? <Card className="rounded-xl"><CardContent className="space-y-3 p-5"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => void load()}>Retry lookup</Button></CardContent></Card>
      : receipt ? <>
        <Card className="rounded-xl"><CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">{receipt.event.title}<Badge variant={receipt.status === 'PAID' ? 'default' : 'secondary'}>{humanize(receipt.status)}</Badge></CardTitle></CardHeader><CardContent className="space-y-1.5 text-sm"><p><strong>Receipt:</strong> <span className="font-mono">{receipt.reference}</span></p><p><strong>Customer:</strong> {receipt.buyerName}</p><p><strong>Event:</strong> {dateLong(receipt.event.startsAt)}</p><p><strong>Payment:</strong> {receipt.paidAt ? `Confirmed on ${dateLong(receipt.paidAt)}` : 'Not verified'}</p></CardContent></Card>
        {!receipt.collectionEnabled && <div role="status" className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><AlertTriangle className="size-5 shrink-0" /> The event's online souvenir collection desk is not yet activated. You can review the receipt, but collection confirmation is disabled.</div>}
        {receipt.collectionEnabled && !receipt.collectionAllowed && <div role="alert" className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><AlertTriangle className="size-5 shrink-0" /> Receipt is not eligible for collection. Do not hand out merchandise until confirmed payment and inventory settlement.</div>}
        <div className="space-y-3">{receipt.items.map((line) => <Card key={line.id} className="rounded-xl"><CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 p-4"><div className="min-w-0"><h2 className="text-sm font-bold [overflow-wrap:break-word]">{line.product.name}{line.product.variantLabel ? ` · ${line.product.variantLabel}` : ''}</h2><p className="text-xs text-muted-foreground">{line.product.sku} · {money(line.lineTotalMinor)}</p><p className="mt-1 text-xs">Ordered {line.qty} · Collected {line.collectedQty} · <strong>{line.remaining} remaining</strong></p></div><div>{line.remaining === 0 ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3" /> Collected</Badge> : <Badge variant="outline">Awaiting handover</Badge>}</div><Button className="col-span-2 min-h-11 w-full" disabled={!receipt.collectionAllowed || line.remaining === 0} onClick={() => { setSelected(line); setQty(1); setActionId(crypto.randomUUID()) }}><ShoppingBag className="mr-1.5 size-4" /> Confirm physical handover</Button>
        {receipt.collectionEnabled && line.returnableQty > 0 && <Button variant="outline" className="col-span-2 min-h-11 w-full" onClick={() => setReturning(line)}><RotateCcw className="mr-1.5 size-4" /> Receive returned item ({line.returnableQty} eligible)</Button>}
        </CardContent></Card>)}</div>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" /> These records only authorize souvenir handover. The customer's admission tickets must be checked separately with the venue check-in scanner.</p>
      </> : null}
    <SouvenirReturnIntakeDialog line={returning} onClose={() => setReturning(null)} onSaved={load} />
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !busy) setSelected(null) }}><DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-xl"><DialogHeader><DialogTitle>Confirm the customer received these items</DialogTitle></DialogHeader>{selected && <div className="space-y-4 text-sm"><p><strong>{selected.product.name}</strong>{selected.product.variantLabel ? ` — ${selected.product.variantLabel}` : ''}</p><p className="text-muted-foreground">Only {selected.remaining} unit(s) remain available for this receipt. Hand the item to the customer before confirming.</p><label htmlFor="collect-qty" className="block text-sm font-semibold">Quantity being handed over</label><select id="collect-qty" value={qty} onChange={(e) => { setQty(Number(e.target.value)); setActionId(crypto.randomUUID()) }} className="h-11 w-full rounded-lg border border-border bg-background px-3">{Array.from({length: Math.min(20,selected.remaining)},(_,i)=>i+1).map((n)=><option key={n} value={n}>{n}</option>)}</select></div>}<DialogFooter className="gap-2 sm:justify-between"><Button variant="outline" disabled={busy} onClick={() => setSelected(null)}>Cancel — do not collect</Button><Button disabled={busy || !selected || !actionId} onClick={() => void confirmCollection()}>{busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 size-4" />} Confirm collection</Button></DialogFooter></DialogContent></Dialog>
  </main>
}
