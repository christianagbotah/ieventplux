'use client'

import { useState } from 'react'
import { CalendarClock, Loader2, Save, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { moneyToInputValue } from '../format'

export type TicketSalesForm = {
  name: string
  price: string
  quota: string
  perBuyerLimit: string
  saleStartsAt: string
  saleEndsAt: string
  groupMinQty: string
  groupPctOff: string
}
export interface TicketSalesRow {
  id: string
  name: string
  priceMinor: number
  quota: number
  soldCount: number
  reservedCount: number
  perBuyerLimit: number
  saleStartsAt?: string | null
  saleEndsAt?: string | null
  groupMinQty?: number | null
  groupPctOff?: number | null
  active: boolean
}
function localDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
export function salesDraft(row: TicketSalesRow): TicketSalesForm {
  return {
    name: row.name, price: moneyToInputValue(row.priceMinor), quota: String(row.quota),
    perBuyerLimit: String(row.perBuyerLimit), saleStartsAt: localDate(row.saleStartsAt),
    saleEndsAt: localDate(row.saleEndsAt), groupMinQty: row.groupMinQty ? String(row.groupMinQty) : '',
    groupPctOff: row.groupPctOff ? String(row.groupPctOff) : '',
  }
}
export function salesPayload(value: TicketSalesForm) {
  return {
    name: value.name.trim(), priceMinor: Math.round(Number(value.price) * 100),
    quota: Number(value.quota), perBuyerLimit: Number(value.perBuyerLimit),
    saleStartsAt: value.saleStartsAt ? new Date(value.saleStartsAt).toISOString() : null,
    saleEndsAt: value.saleEndsAt ? new Date(value.saleEndsAt).toISOString() : null,
    groupMinQty: value.groupMinQty === '' ? null : Number(value.groupMinQty),
    groupPctOff: value.groupPctOff === '' ? null : Number(value.groupPctOff),
  }
}
export function TicketSalesFields({ value, onChange, priceLocked = false }: {
  value: TicketSalesForm
  onChange: (next: TicketSalesForm) => void
  priceLocked?: boolean
}) {
  const update = (key: keyof TicketSalesForm, next: string) => onChange({ ...value, [key]: next })
  const groupOn = value.groupMinQty !== '' || value.groupPctOff !== ''
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><Label>Ticket name</Label><Input maxLength={80} value={value.name} onChange={(e) => update('name', e.target.value)} placeholder="Early bird, General Admission, VIP…" /></div>
        <div className="space-y-1.5"><Label>Ticket price (₵)</Label><Input inputMode="decimal" disabled={priceLocked} value={value.price} onChange={(e) => update('price', e.target.value)} placeholder="0.00" />{priceLocked && <p className="text-[11px] text-muted-foreground">Price is locked after tickets have been sold to protect historical orders.</p>}</div>
        <div className="space-y-1.5"><Label>Capacity (0 = unlimited)</Label><Input inputMode="numeric" value={value.quota} onChange={(e) => update('quota', e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Maximum tickets per buyer</Label><Input type="number" min="1" max="10" value={value.perBuyerLimit} onChange={(e) => update('perBuyerLimit', e.target.value)} /></div>
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3 sm:p-4">
        <div className="flex items-center gap-2"><CalendarClock className="size-4 text-primary"/><div><p className="text-sm font-semibold">Ticket sale window</p><p className="text-xs text-muted-foreground">Optional: automatically open and close purchases at these times.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Sales open</Label><Input type="datetime-local" value={value.saleStartsAt} onChange={(e) => update('saleStartsAt', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Sales close</Label><Input type="datetime-local" value={value.saleEndsAt} onChange={(e) => update('saleEndsAt', e.target.value)} /></div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">Times use your device's local timezone. A scheduled ticket is not purchasable before its start or after its closing time.</p>
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Tag className="size-4 text-primary"/><div><p className="text-sm font-semibold">Group offer</p><p className="text-xs text-muted-foreground">Automatically discount a qualifying quantity in one order.</p></div></div><Switch checked={groupOn} aria-label="Enable group discount" onCheckedChange={(checked) => onChange({ ...value, groupMinQty: checked ? '2' : '', groupPctOff: checked ? '10' : '' })} /></div>
        {groupOn && <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Minimum group quantity</Label><Input type="number" min="2" max="10" value={value.groupMinQty} onChange={(e) => update('groupMinQty', e.target.value)} /></div><div className="space-y-1.5"><Label>Group discount (%)</Label><Input type="number" min="1" max="90" value={value.groupPctOff} onChange={(e) => update('groupPctOff', e.target.value)} /></div></div>}
        {groupOn && <p className="text-[11px] text-muted-foreground">Minimum group quantity must not exceed the per-buyer limit. Discounts apply only to paid tickets; checkout calculates the final total.</p>}
      </div>
    </div>
  )
}

export function TicketSalesEditor({ eventId, ticket, onClose, onSaved }: {
  eventId: string
  ticket: TicketSalesRow
  onClose: () => void
  onSaved: () => void
}) {
  const [value, setValue] = useState<TicketSalesForm>(() => salesDraft(ticket))
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()
  const save = async () => {
    if (busy || !value.name.trim()) return
    setBusy(true)
    try {
      await api.patch(`/events/${eventId}/ticket-types/${ticket.id}`, salesPayload(value))
      toast({ title: 'Ticket sales settings updated', description: 'New purchases use these settings. Existing financial records remain unchanged.' })
      onSaved()
      onClose()
    } catch (err) {
      toast({ title: 'Could not update ticket', description: err instanceof ApiClientError ? err.message : 'Please check your values.', variant: 'destructive' })
    } finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader><DialogTitle>Manage ticket · {ticket.name}</DialogTitle><DialogDescription>Set price, release windows, group offers and capacity. Sales history will not be deleted.</DialogDescription></DialogHeader>
        <TicketSalesFields value={value} onChange={setValue} priceLocked={ticket.soldCount > 0} />
        <DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="button" disabled={busy || !value.name.trim()} onClick={() => void save()}>{busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />} Save ticket settings</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
