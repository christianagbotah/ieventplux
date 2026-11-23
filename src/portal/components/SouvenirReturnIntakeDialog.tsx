'use client'

import { useEffect, useState } from 'react'
import { RotateCcw, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { api, ApiClientError } from '../api'
import { useToast } from '@/hooks/use-toast'

type ReturnableLine = {
  id: string; returnableQty: number; product: { name: string; variantLabel?: string | null }
}

/** Confirm only actual custody transfer; no refund/stock mutation implied. */
export function SouvenirReturnIntakeDialog({ line, onClose, onSaved }: {
  line: ReturnableLine | null; onClose: () => void; onSaved: () => Promise<void>
}) {
  const { toast } = useToast()
  const [qty, setQty] = useState(1)
  const [condition, setCondition] = useState<'SEALED' | 'OPENED' | 'DAMAGED'>('SEALED')
  const [reason, setReason] = useState('')
  const [evidenceNote, setEvidenceNote] = useState('')
  const [actionId, setActionId] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (line) {
      setQty(1); setCondition('SEALED'); setReason(''); setEvidenceNote('')
      setActionId(crypto.randomUUID())
    }
  }, [line?.id])
  const changed = () => setActionId(crypto.randomUUID())
  const submit = async () => {
    if (!line || busy || !actionId) return
    setBusy(true)
    try {
      const result = await api.post<{ status: string }>('/souvenir-returns', {
        orderItemId: line.id, qty, condition, reason, evidenceNote, clientActionId: actionId,
      })
      toast({ title: result.status === 'ALREADY_RECORDED' ? 'Return already recorded' : 'Physical return received',
        description: 'Intake documented for independent finance review. No money refunded, tickets revoked or stock restocked.' })
      onClose()
      await onSaved()
    } catch (err) {
      toast({ title: 'Could not record physical return', variant: 'destructive',
        description: err instanceof ApiClientError ? err.message : 'The return could not be confirmed. Please retry.' })
    } finally { setBusy(false) }
  }
  return <Dialog open={Boolean(line)} onOpenChange={(open) => { if (!open && !busy) onClose() }}>
    <DialogContent className="w-[calc(100vw-24px)] max-w-lg rounded-xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2 text-base"><RotateCcw className="size-5 text-primary" /> Record a physical souvenir return</DialogTitle></DialogHeader>
      {line && <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1 text-sm">
        <p className="font-semibold">{line.product.name}{line.product.variantLabel ? ` · ${line.product.variantLabel}` : ''}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">Confirm that the item is actually in your custody. Up to {line.returnableQty} previously collected units can be recorded. This does NOT refund money or restore saleable inventory.</p>
        <label className="block space-y-1.5"><span className="text-xs font-bold">Quantity physically returned</span>
          <select className="h-11 w-full rounded-lg border border-border bg-background px-3" value={qty} onChange={(e) => { setQty(Number(e.target.value)); changed() }}>
            {Array.from({ length: Math.min(20, line.returnableQty) }, (_, i) => i + 1).map((number) => <option key={number} value={number}>{number}</option>)}
          </select></label>
        <label className="block space-y-1.5"><span className="text-xs font-bold">Observed condition</span>
          <select className="h-11 w-full rounded-lg border border-border bg-background px-3" value={condition} onChange={(e) => { setCondition(e.target.value as typeof condition); changed() }}>
            <option value="SEALED">Sealed / unopened</option><option value="OPENED">Opened / worn</option><option value="DAMAGED">Damaged</option>
          </select></label>
        <label className="block space-y-1.5"><span className="text-xs font-bold">Reason for return</span>
          <textarea className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2" maxLength={500} value={reason} onChange={(e) => { setReason(e.target.value); changed() }} placeholder="Describe the customer's requested return and why (10+ characters)" /></label>
        <label className="block space-y-1.5"><span className="text-xs font-bold">Physical evidence / inspection note</span>
          <textarea className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2" maxLength={1000} value={evidenceNote} onChange={(e) => { setEvidenceNote(e.target.value); changed() }} placeholder="What did you actually inspect, and what is the physical condition? (12+ characters)" /></label>
        <p className="rounded-lg bg-secondary/50 p-3 text-xs leading-relaxed">The return remains pending review by another finance-authorized staff member. Do not mark a buyer refunded or place the item back on sale until the separate verified financial reconciliation is completed.</p>
      </div>}
      <DialogFooter className="gap-2 sm:justify-between"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !line || qty > line.returnableQty || reason.trim().length < 10 || evidenceNote.trim().length < 12} onClick={() => void submit()}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RotateCcw className="mr-2 size-4" />} Confirm physical receipt</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
