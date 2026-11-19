'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { CalendarClock, FileText, ImagePlus, Loader2, Package, Pencil, Plus, Trash2, UsersRound } from 'lucide-react'
import { api, ApiClientError } from '../api'
import { OrganizerEventCover } from './OrganizerEventCover'
import { money } from '../format'

type Contributor = {
  id: string; name: string; role: string; topic?: string | null; bio?: string | null; photoUrl?: string | null;
  startsAt?: string | null; endsAt?: string | null; sortOrder: number; published: boolean
}
type Souvenir = {
  id: string; name: string; sku: string; variantLabel?: string | null; priceMinor: number; stockTotal: number;
  stockSold: number; stockReserved: number; stockFulfilled: number; description?: string | null;
  imageUrl?: string | null; active: boolean; sortOrder: number
}
type ProgrammeFile = { id: string; title: string; downloadUrl: string }
const ROLES = [
  ['HEADLINER', 'Headline artist'], ['ARTIST', 'Artist / performer'], ['MAIN_SPEAKER', 'Main speaker'],
  ['ASSISTANT_SPEAKER', 'Assistant speaker'], ['GUEST_SPEAKER', 'Invited speaker'],
  ['SPECIAL_GUEST', 'Special guest'], ['PANELIST', 'Panelist'], ['MC', 'Master of ceremonies'],
  ['DJ', 'DJ'], ['HOST', 'Host / presenter'],
] as const
const blankPerson = { name: '', role: 'GUEST_SPEAKER', topic: '', bio: '', photoUrl: '', startsAt: '', endsAt: '', sortOrder: '0', published: true }
const blankProduct = { name: '', sku: '', variantLabel: '', description: '', price: '', stockTotal: '10', imageUrl: '', sortOrder: '0', active: true }
function localDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function EventOperationsEditor({ eventId }: { eventId: string }) {
  const { toast } = useToast()
  const [people, setPeople] = useState<Contributor[]>([])
  const [products, setProducts] = useState<Souvenir[]>([])
  const [programmes, setProgrammes] = useState<ProgrammeFile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [personEdit, setPersonEdit] = useState<string | null>(null)
  const [productEdit, setProductEdit] = useState<string | null>(null)
  const [person, setPerson] = useState({ ...blankPerson })
  const [product, setProduct] = useState({ ...blankProduct })
  const pdfRef = useRef<HTMLInputElement>(null)
  const portraitRef = useRef<HTMLInputElement>(null)
  const productImageRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const [p, s, e] = await Promise.all([
      api.get<{ items: Contributor[] }>(`/events/${eventId}/contributors`),
      api.get<{ items: Souvenir[] }>(`/events/${eventId}/souvenirs`),
      api.get<{ event: { programmes?: ProgrammeFile[] } }>(`/events/${eventId}`),
    ])
    setPeople(p.items)
    setProducts(s.items)
    setProgrammes(e.event.programmes ?? [])
  }, [eventId])
  useEffect(() => { void load().catch(() => toast({ title: 'Programme could not load', description: 'Refresh to retry event operations.', variant: 'destructive' })).finally(() => setLoading(false)) }, [load, toast])

  const handleError = (err: unknown, what: string) => toast({ title: `Could not ${what}`, description: err instanceof Error ? err.message : 'Please check your details and retry.', variant: 'destructive' })
  const changePerson = (key: keyof typeof blankPerson, value: string | boolean) => setPerson((previous) => ({ ...previous, [key]: value }))
  const changeProduct = (key: keyof typeof blankProduct, value: string | boolean) => setProduct((previous) => ({ ...previous, [key]: value }))

  const savePerson = async () => {
    if (busy) return
    setBusy(true)
    try {
      const payload = {
        ...person, sortOrder: Number(person.sortOrder),
        startsAt: person.startsAt ? new Date(person.startsAt).toISOString() : null,
        endsAt: person.endsAt ? new Date(person.endsAt).toISOString() : null,
      }
      if (personEdit) await api.patch(`/events/${eventId}/contributors/${personEdit}`, payload)
      else await api.post(`/events/${eventId}/contributors`, payload)
      await load()
      setPerson({ ...blankPerson }); setPersonEdit(null)
      toast({ title: 'Event lineup updated' })
    } catch (error) { handleError(error, 'save participant') } finally { setBusy(false) }
  }
  const saveProduct = async () => {
    if (busy) return
    setBusy(true)
    try {
      const value = Number(product.price)
      if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(Math.round(value * 100))) throw new Error('Price must be positive.')
      const payload = {
        ...product, priceMinor: Math.round(value * 100), stockTotal: Number(product.stockTotal), sortOrder: Number(product.sortOrder),
      }
      if (productEdit) await api.patch(`/events/${eventId}/souvenirs/${productEdit}`, payload)
      else await api.post(`/events/${eventId}/souvenirs`, payload)
      await load()
      setProduct({ ...blankProduct }); setProductEdit(null)
      toast({ title: 'Souvenir catalogue updated' })
    } catch (error) { handleError(error, 'save souvenir') } finally { setBusy(false) }
  }
  const startPersonEdit = (entry: Contributor) => {
    setPersonEdit(entry.id)
    setPerson({ ...blankPerson, name: entry.name, role: entry.role, topic: entry.topic ?? '', bio: entry.bio ?? '', photoUrl: entry.photoUrl ?? '', startsAt: localDate(entry.startsAt), endsAt: localDate(entry.endsAt), sortOrder: String(entry.sortOrder), published: entry.published })
  }
  const startProductEdit = (entry: Souvenir) => {
    setProductEdit(entry.id)
    setProduct({ ...blankProduct, name: entry.name, sku: entry.sku, variantLabel: entry.variantLabel ?? '', description: entry.description ?? '', price: (entry.priceMinor / 100).toFixed(2), stockTotal: String(entry.stockTotal), imageUrl: entry.imageUrl ?? '', sortOrder: String(entry.sortOrder), active: entry.active })
  }
  const remove = async (kind: 'contributors' | 'souvenirs', id: string) => {
    if (busy) return
    setBusy(true)
    try {
      await api.delete(`/events/${eventId}/${kind}/${id}`)
      await load()
      toast({ title: kind === 'contributors' ? 'Person removed from lineup' : 'Souvenir hidden from catalogue' })
    } catch (error) { handleError(error, 'remove item') } finally { setBusy(false) }
  }
  const uploadImage = async (file: File, kind: 'SPEAKER_PHOTO' | 'MERCH_PHOTO') => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file); form.append('kind', kind); form.append('eventId', eventId)
      const result = await api.upload<{ asset: { url: string } }>('/uploads', form)
      if (kind === 'SPEAKER_PHOTO') changePerson('photoUrl', result.asset.url)
      else changeProduct('imageUrl', result.asset.url)
      toast({ title: 'Image uploaded' })
    } catch (error) { handleError(error, 'upload image') } finally { setUploading(false) }
  }
  const uploadProgramme = async (file: File) => {
    setUploading(true)
    try {
      if (file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024) throw new Error('Select a PDF smaller than 10MB.')
      const form = new FormData()
      form.append('file', file); form.append('eventId', eventId)
      form.append('kind', 'PROGRAMME'); form.append('caption', file.name.slice(0, 200))
      await api.upload('/uploads', form)
      await load()
      toast({ title: 'Programme uploaded', description: 'Event attendees can open it from the event page according to its visibility.' })
    } catch (error) { handleError(error, 'upload programme PDF') } finally { setUploading(false) }
    if (pdfRef.current) pdfRef.current.value = ''
  }
  const removeProgramme = async (docId: string) => {
    setBusy(true)
    try {
      await api.delete(`/events/${eventId}/programmes/${docId}`)
      await load()
      toast({ title: 'Programme removed from event page' })
    } catch (error) { handleError(error, 'remove programme') } finally { setBusy(false) }
  }
  if (loading) return <p role="status" className="rounded-xl border p-4 text-sm text-muted-foreground">Loading event lineup, programme and souvenirs…</p>

  return (
    <section className="space-y-3" aria-label="Complete event programme and souvenir management">
      <h3 className="text-base font-extrabold">Event programme, artists & souvenirs</h3>
      <p className="text-xs text-muted-foreground">Build the complete event experience here. Add confirmed artist and speaker details, upload programme outlines and prepare a souvenir catalogue. Ticket entry and souvenir collection are separate workflows.</p>
      <details className="group rounded-xl border border-border bg-card p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold"><UsersRound className="size-4 text-primary" /> Artists, invited guests and speakers <Badge variant="secondary">{people.length}</Badge></summary>
        <div className="mt-3 space-y-3 border-t pt-3">
          {people.map((p) => <div key={p.id} className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 rounded-xl border bg-secondary/20 p-2.5">
            <OrganizerEventCover src={p.photoUrl} title={p.name} />
            <div className="min-w-0"><p className="text-sm font-bold [overflow-wrap:anywhere]">{p.name}</p><p className="text-xs text-muted-foreground">{ROLES.find((r) => r[0] === p.role)?.[1] ?? p.role}{p.topic ? ` · ${p.topic}` : ''}</p>{p.bio && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.bio}</p>}</div>
            <div className="col-span-2 flex flex-wrap justify-end gap-2"><Button type="button" size="sm" variant="outline" onClick={() => startPersonEdit(p)}><Pencil className="mr-1 size-3.5" /> Edit</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void remove('contributors', p.id)}><Trash2 className="mr-1 size-3.5" /> Remove</Button></div>
          </div>)}
          <p className="text-xs font-bold">{personEdit ? 'Update participant' : 'Add performer, guest or speaker'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Full or stage name</Label><Input maxLength={120} value={person.name} onChange={(e) => changePerson('name', e.target.value)} placeholder="Name as it should appear" /></div>
            <div className="space-y-1"><Label>Role</Label><Select value={person.role} onValueChange={(v) => changePerson('role', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1 sm:col-span-2"><Label>Speaking topic, set or presentation</Label><Input maxLength={240} value={person.topic} onChange={(e) => changePerson('topic', e.target.value)} placeholder="e.g. Leadership, worship ministration, keynote" /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Biography / introduction</Label><Textarea rows={3} maxLength={1600} value={person.bio} onChange={(e) => changePerson('bio', e.target.value)} placeholder="Verified biography or short introduction" /></div>
            <div className="space-y-1"><Label>Scheduled start (optional)</Label><Input type="datetime-local" value={person.startsAt} onChange={(e) => changePerson('startsAt', e.target.value)} /></div>
            <div className="space-y-1"><Label>Scheduled finish (optional)</Label><Input type="datetime-local" value={person.endsAt} onChange={(e) => changePerson('endsAt', e.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Profile photo</Label><Input value={person.photoUrl} maxLength={400} onChange={(e) => changePerson('photoUrl', e.target.value)} placeholder="Uploaded image URL or secure HTTPS image" /><input className="hidden" type="file" ref={portraitRef} accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f, 'SPEAKER_PHOTO') }} /><Button type="button" size="sm" variant="outline" className="mt-1.5" disabled={uploading} onClick={() => portraitRef.current?.click()}><ImagePlus className="mr-1 size-4" /> Upload portrait</Button></div>
          </div>
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={busy || !person.name.trim()} onClick={() => void savePerson()}>{busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}{personEdit ? 'Save changes' : 'Add to lineup'}</Button>{personEdit && <Button type="button" size="sm" variant="outline" onClick={() => { setPerson({ ...blankPerson }); setPersonEdit(null) }}>Cancel edit</Button>}</div>
        </div>
      </details>
      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold"><FileText className="size-4 text-primary" /> Programme outlines and brochures <Badge variant="secondary">{programmes.length}</Badge></summary>
        <div className="mt-3 space-y-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">Upload one or more PDF outlines (maximum 10MB each). Invitation-only programmes are restricted to approved guests and organizer staff.</p>
          {programmes.map((doc) => <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"><a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 break-all text-sm font-semibold text-primary hover:underline"><FileText className="mr-1.5 inline size-4" />{doc.title}</a><Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeProgramme(doc.id)}><Trash2 className="mr-1 size-3.5" /> Remove</Button></div>)}
          <input type="file" ref={pdfRef} className="hidden" accept="application/pdf,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadProgramme(f) }} />
          <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => pdfRef.current?.click()}>{uploading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <FileText className="mr-1 size-4" />} Upload programme PDF</Button>
        </div>
      </details>
      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold"><Package className="size-4 text-primary" /> Souvenir catalogue and size variants <Badge variant="secondary">{products.length}</Badge></summary>
        <div className="mt-3 space-y-3 border-t pt-3">
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-800 dark:text-amber-300">Catalogue setup is available now. Paid online merchandise orders, QR collection receipts, and stock reservation are not activated until their payment and fulfilment verification is completed. Do not promise online orders yet.</p>
          {products.map((p) => <div key={p.id} className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 rounded-xl border p-2.5">
            <OrganizerEventCover src={p.imageUrl} title={p.name} />
            <div className="min-w-0"><p className="text-sm font-bold">{p.name}{p.variantLabel ? ` · ${p.variantLabel}` : ''}</p><p className="text-xs text-muted-foreground">{p.sku} · {money(p.priceMinor)} · {Math.max(0, p.stockTotal - p.stockSold - p.stockReserved)} available {!p.active && '· hidden'}</p></div>
            <div className="col-span-2 flex justify-end gap-2"><Button type="button" size="sm" variant="outline" onClick={() => startProductEdit(p)}><Pencil className="mr-1 size-3.5" /> Edit</Button>{p.active && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void remove('souvenirs', p.id)}><Trash2 className="mr-1 size-3.5" /> Hide</Button>}</div>
          </div>)}
          <p className="text-xs font-bold">{productEdit ? 'Edit souvenir variant' : 'Add souvenir or variant'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Item name</Label><Input maxLength={120} value={product.name} onChange={(e) => changeProduct('name', e.target.value)} placeholder="Official T-shirt" /></div>
            <div className="space-y-1"><Label>Size, colour or variant</Label><Input maxLength={80} value={product.variantLabel} onChange={(e) => changeProduct('variantLabel', e.target.value)} placeholder="Medium · Black" /></div>
            <div className="space-y-1"><Label>Unique SKU / product code</Label><Input maxLength={50} value={product.sku} onChange={(e) => changeProduct('sku', e.target.value.toUpperCase())} placeholder="TS-M-BLK" /></div>
            <div className="space-y-1"><Label>Price (₵)</Label><Input inputMode="decimal" value={product.price} onChange={(e) => changeProduct('price', e.target.value)} placeholder="45.00" /></div>
            <div className="space-y-1"><Label>Stock available</Label><Input type="number" min={0} max={100000} value={product.stockTotal} onChange={(e) => changeProduct('stockTotal', e.target.value)} /></div>
            <div className="space-y-1"><Label>Display order</Label><Input type="number" min={0} max={1000} value={product.sortOrder} onChange={(e) => changeProduct('sortOrder', e.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Description / collection information</Label><Textarea rows={2} maxLength={1000} value={product.description} onChange={(e) => changeProduct('description', e.target.value)} placeholder="Fabric, size guide, collection point or availability information" /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Product photo</Label><Input value={product.imageUrl} onChange={(e) => changeProduct('imageUrl', e.target.value)} placeholder="Uploaded or HTTPS image URL" /><input className="hidden" type="file" ref={productImageRef} accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f, 'MERCH_PHOTO') }} /><Button type="button" size="sm" className="mt-1.5" variant="outline" disabled={uploading} onClick={() => productImageRef.current?.click()}><ImagePlus className="mr-1 size-4" /> Upload product photo</Button></div>
          </div>
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={busy || !product.name.trim() || !product.sku.trim()} onClick={() => void saveProduct()}>{busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}{productEdit ? 'Save variant' : 'Add catalogue item'}</Button>{productEdit && <Button type="button" size="sm" variant="outline" onClick={() => { setProduct({ ...blankProduct }); setProductEdit(null) }}>Cancel edit</Button>}</div>
        </div>
      </details>
      <p className="flex items-center gap-2 text-[11px] leading-relaxed text-muted-foreground"><CalendarClock className="size-3.5 shrink-0" /> Use the Agenda section for detailed time slots; the lineup above gives each confirmed person their own public profile.</p>
    </section>
  )
}
