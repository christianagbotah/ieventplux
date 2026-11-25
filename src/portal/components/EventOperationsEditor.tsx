'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError, FieldHelp } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { CalendarClock, CheckCircle2, ChevronDown, FileText, ImagePlus, Package, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, UsersRound } from 'lucide-react'
import { api, ApiClientError } from '../api'
import { OrganizerEventCover } from './OrganizerEventCover'
import { EventAgendaEditor } from './EventAgendaEditor'
import { SouvenirRequests } from './SouvenirRequests'
import { money, dateLong } from '../format'
import { personFormError, souvenirFormError, souvenirPriceMinor, programmePdfError, eventImageError } from '../lib/event-programme-form'

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
  const [loadError, setLoadError] = useState('')
  const [personError, setPersonError] = useState('')
  const [productError, setProductError] = useState('')
  const [pendingRemove, setPendingRemove] = useState<{ kind: 'contributors' | 'souvenirs' | 'programmes'; id: string; name: string } | null>(null)
  const personFormRef = useRef<HTMLDivElement>(null)
  const productFormRef = useRef<HTMLDivElement>(null)
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
    setLoadError('')
  }, [eventId])
  useEffect(() => { void load().catch(() => setLoadError('Could not load event programme details. Check the connection and retry.')).finally(() => setLoading(false)) }, [load])

  const handleError = (err: unknown, what: string) => toast({ title: `Could not ${what}`, description: err instanceof Error ? err.message : 'Please check your details and retry.', variant: 'destructive' })
  const changePerson = (key: keyof typeof blankPerson, value: string | boolean) => {
    setPersonError('')
    setPerson((previous) => ({ ...previous, [key]: value }))
  }
  const changeProduct = (key: keyof typeof blankProduct, value: string | boolean) => {
    setProductError('')
    setProduct((previous) => ({ ...previous, [key]: value }))
  }

  const savePerson = async () => {
    if (busy || uploading) return
    const error = personFormError(person)
    if (error) { setPersonError(error); return }
    setPersonError('')
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
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'Could not save this participant. Try again.'
      setPersonError(message)
      handleError(error, 'save participant')
    } finally { setBusy(false) }
  }
  const saveProduct = async () => {
    if (busy || uploading) return
    const error = souvenirFormError(product)
    if (error) { setProductError(error); return }
    const priceMinor = souvenirPriceMinor(product.price)
    if (priceMinor === null) { setProductError('Enter a valid price in ₵.'); return }
    setProductError('')
    setBusy(true)
    try {
      const payload = {
        ...product, priceMinor, stockTotal: Number(product.stockTotal), sortOrder: Number(product.sortOrder),
      }
      if (productEdit) await api.patch(`/events/${eventId}/souvenirs/${productEdit}`, payload)
      else await api.post(`/events/${eventId}/souvenirs`, payload)
      await load()
      setProduct({ ...blankProduct }); setProductEdit(null)
      toast({ title: 'Souvenir catalogue updated' })
    } catch (error) {
      setProductError(error instanceof ApiClientError ? error.message : 'Could not save the souvenir. Try again.')
      handleError(error, 'save souvenir')
    } finally { setBusy(false) }
  }
  const startPersonEdit = (entry: Contributor) => {
    setPersonError('')
    setPersonEdit(entry.id)
    personFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    setPerson({ ...blankPerson, name: entry.name, role: entry.role, topic: entry.topic ?? '', bio: entry.bio ?? '', photoUrl: entry.photoUrl ?? '', startsAt: localDate(entry.startsAt), endsAt: localDate(entry.endsAt), sortOrder: String(entry.sortOrder), published: entry.published })
  }
  const startProductEdit = (entry: Souvenir) => {
    setProductError('')
    setProductEdit(entry.id)
    productFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    setProduct({ ...blankProduct, name: entry.name, sku: entry.sku, variantLabel: entry.variantLabel ?? '', description: entry.description ?? '', price: (entry.priceMinor / 100).toFixed(2), stockTotal: String(entry.stockTotal), imageUrl: entry.imageUrl ?? '', sortOrder: String(entry.sortOrder), active: entry.active })
  }
  const confirmRemove = async () => {
    if (busy || !pendingRemove) return
    const { kind, id } = pendingRemove
    setBusy(true)
    try {
      await api.delete(`/events/${eventId}/${kind}/${id}`)
      await load()
      setPendingRemove(null)
      toast({ title: kind === 'contributors' ? 'Person removed from lineup' : kind === 'programmes' ? 'Programme removed from event page' : 'Souvenir hidden from catalogue' })
    } catch (error) { handleError(error, kind === 'contributors' ? 'remove person' : kind === 'programmes' ? 'remove programme' : 'hide souvenir') }
    finally { setBusy(false) }
  }
  const uploadImage = async (file: File, kind: 'SPEAKER_PHOTO' | 'MERCH_PHOTO') => {
    if (uploading) return
    const issue = eventImageError(file)
    if (issue) { toast({ title: 'Invalid image', description: issue, variant: 'destructive' }); return }
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
    if (uploading) return
    const issue = programmePdfError(file)
    if (issue) { toast({ title: 'Invalid programme', description: issue, variant: 'destructive' }); return }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file); form.append('eventId', eventId)
      form.append('kind', 'PROGRAMME'); form.append('caption', file.name.slice(0, 200))
      await api.upload('/uploads', form)
      await load()
      toast({ title: 'Programme uploaded', description: 'Event attendees can open it from the event page according to its visibility.' })
    } catch (error) { handleError(error, 'upload programme PDF') } finally { setUploading(false) }
    if (pdfRef.current) pdfRef.current.value = ''
  }
  if (loading) return <div role="status" aria-label="Loading event programme" className="space-y-3 rounded-2xl border border-border/80 bg-card p-5">
    <div className="h-5 w-48 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
    <div className="h-12 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
    <div className="h-12 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
  </div>

  return (
    <section className="min-w-0 space-y-4 sm:space-y-5" aria-label="Complete event programme and souvenir management">
      <header className="relative isolate overflow-hidden rounded-2xl border border-emerald-900/15 bg-gradient-to-br from-[#064b40] via-[#0d665a] to-[#123d49] p-5 text-white shadow-[0_10px_26px_rgb(4_68_59_/_0.12)] sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 -z-10 size-52 rounded-full border border-white/10 bg-white/[0.035]" />
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-100/85">Event production studio</p>
        <h3 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Lineup, programme &amp; merchandise</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-50/90">
          Bring the event story to life. Add verified performers, speakers, programme PDFs and product catalogue information.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5">{people.length} people</span>
          <span className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5">{programmes.length} documents</span>
          <span className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5">{products.length} products</span>
        </div>
      </header>
      <EventAgendaEditor eventId={eventId} />
      <SouvenirRequests key={eventId} eventId={eventId}/>
      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        <span>{loadError}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => void load().catch(() => setLoadError('Could not load programme information. Try again.'))}>
          <RefreshCw className="size-4" aria-hidden /> Retry
        </Button>
      </div>}
      <details className="group min-w-0 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-bold transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-primary/25 sm:px-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><UsersRound className="size-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">Artists, invited guests &amp; speakers</span>
          <Badge variant="secondary">{people.length}</Badge>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-4 border-t border-border/70 p-4 sm:p-5">
          <p className="text-xs leading-relaxed text-muted-foreground">Show each person's role, appearance, time, photo and introduction. Only people marked visible appear to attendees.</p>
          {people.map((p) => <div key={p.id} className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 rounded-xl border bg-secondary/20 p-2.5">
            <OrganizerEventCover src={p.photoUrl} title={p.name} />
            <div className="min-w-0"><p className="text-sm font-bold [overflow-wrap:anywhere]">{p.name}</p><p className="text-xs text-muted-foreground">{ROLES.find((r) => r[0] === p.role)?.[1] ?? p.role}{p.topic ? ` · ${p.topic}` : ''}</p>{!p.published && <Badge variant="outline" className="mt-1">Hidden from guests</Badge>}
              {p.startsAt && <p className="mt-1 text-xs text-muted-foreground">Appearance: {dateLong(p.startsAt)}{p.endsAt ? ` – ${dateLong(p.endsAt)}` : ''}</p>}
              {p.bio && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.bio}</p>}</div>
            <div className="col-span-2 flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => startPersonEdit(p)}><Pencil className="size-4" aria-hidden /> Edit</Button>
              <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy}
                onClick={() => setPendingRemove({ kind: 'contributors', id: p.id, name: p.name })}>
                <Trash2 className="size-4" aria-hidden /> Remove
              </Button>
            </div>
          </div>)}
          <div ref={personFormRef} className="scroll-mt-20 border-t border-border/70 pt-4">
            <h4 className="text-sm font-bold">{personEdit ? 'Edit lineup participant' : 'Add a performer, guest or speaker'}</h4>
            <p className="mt-1 text-xs text-muted-foreground">Every guest is shown with their assigned role. Add their exact topic if applicable.</p>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5"><Label htmlFor="lineup-name">Full or stage name <span className="text-destructive">*</span></Label>
              <Input id="lineup-name" maxLength={120} value={person.name} onChange={(e) => changePerson('name', e.target.value)} placeholder="Name as it should appear" />
            </div>
            <div className="min-w-0 space-y-1.5"><Label htmlFor="lineup-role">Person's role</Label>
              <Select value={person.role} onValueChange={(v) => changePerson('role', v)}><SelectTrigger id="lineup-role" aria-label="Person's role"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="min-w-0 space-y-1.5 sm:col-span-2"><Label htmlFor="lineup-topic">Speaking topic or performance</Label>
              <Input id="lineup-topic" maxLength={240} value={person.topic} onChange={(e) => changePerson('topic', e.target.value)}
                placeholder="e.g. Leadership keynote, worship ministration, music set" />
              <FieldHelp>Tell attendees what this person is scheduled to speak or perform on.</FieldHelp>
            </div>
            <div className="min-w-0 space-y-1.5 sm:col-span-2"><Label htmlFor="lineup-bio">Biography / introduction</Label>
              <Textarea id="lineup-bio" rows={3} maxLength={1600} value={person.bio}
                onChange={(e) => changePerson('bio', e.target.value)} placeholder="Verified biography or a short introduction" />
              <FieldHelp>{person.bio.length.toLocaleString()} / 1,600 characters</FieldHelp>
            </div>
            <div className="min-w-0 space-y-1.5"><Label htmlFor="lineup-start">Scheduled start (optional)</Label>
              <Input id="lineup-start" type="datetime-local" value={person.startsAt} onChange={(e) => changePerson('startsAt', e.target.value)} />
            </div>
            <div className="min-w-0 space-y-1.5"><Label htmlFor="lineup-end">Scheduled finish (optional)</Label>
              <Input id="lineup-end" type="datetime-local" value={person.endsAt} onChange={(e) => changePerson('endsAt', e.target.value)} />
              <FieldHelp>Times use your device's local time zone. Finish must be after start.</FieldHelp>
            </div>
            <div className="min-w-0 space-y-1.5 sm:col-span-2"><Label htmlFor="lineup-photo">Profile photo</Label>
              <Input id="lineup-photo" value={person.photoUrl} maxLength={400} onChange={(e) => changePerson('photoUrl', e.target.value)} placeholder="Uploaded image URL or secure HTTPS image" />
              <input className="hidden" type="file" ref={portraitRef} accept="image/png,image/jpeg,image/webp"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f, 'SPEAKER_PHOTO'); e.target.value = '' }} />
              <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => portraitRef.current?.click()}>
                {!uploading && <ImagePlus className="size-4" aria-hidden />} Upload portrait
              </Button>
              <FieldHelp>PNG, JPEG or WebP, up to 5 MB. Only use photographs you have permission to publish.</FieldHelp>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/30 p-3 sm:col-span-2">
              <div className="min-w-0">
                <Label htmlFor="lineup-published" className="font-semibold">Visible on public event page</Label>
                <p className="mt-1 text-xs text-muted-foreground">Hide an unconfirmed guest until their appearance is approved.</p>
              </div>
              <Switch id="lineup-published" checked={person.published} onCheckedChange={(on) => changePerson('published', on)} />
            </div>
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="lineup-order">Display order</Label>
              <Input id="lineup-order" type="number" min={0} max={1000} step={1} className="max-w-40"
                value={person.sortOrder} onChange={(e) => changePerson('sortOrder', e.target.value)} />
              <FieldHelp>Lower numbers appear first. Use 0–1,000.</FieldHelp>
            </div>
          </div>
          {personError && <FieldError>{personError}</FieldError>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="premium" loading={busy} disabled={uploading || !person.name.trim()} onClick={() => void savePerson()}>
              {!busy && (personEdit ? <CheckCircle2 className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />)}
              {personEdit ? 'Save participant' : 'Add to lineup'}
            </Button>
            {personEdit && <Button type="button" variant="outline" disabled={busy} onClick={() => { setPerson({ ...blankPerson }); setPersonEdit(null); setPersonError('') }}>Cancel edit</Button>}
          </div>
        </div>
      </details>
      <details className="group min-w-0 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-bold transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-primary/25 sm:px-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">Event programmes &amp; brochures</span>
          <Badge variant="secondary">{programmes.length}</Badge>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-3 border-t border-border/70 p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">Upload one or more PDF outlines (maximum 10MB each). Invitation-only programmes are restricted to approved guests and organizer staff.</p>
          {programmes.map((doc) => <div key={doc.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 p-3">
            <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer"
              className="flex min-w-0 flex-1 items-center gap-2 break-words rounded-lg text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/25">
              <FileText className="size-5 shrink-0" aria-hidden /> <span className="min-w-0 break-words">{doc.title}</span>
            </a>
            <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={busy}
              onClick={() => setPendingRemove({ kind: 'programmes', id: doc.id, name: doc.title })}>
              <Trash2 className="size-4" aria-hidden /> Remove
            </Button>
          </div>)}
          <input type="file" ref={pdfRef} className="hidden" accept="application/pdf,.pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadProgramme(f); e.target.value = '' }} />
          <Button type="button" variant="outline" loading={uploading} disabled={busy} onClick={() => pdfRef.current?.click()}>
            {!uploading && <FileText className="size-4" aria-hidden />} Upload programme PDF
          </Button>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            The server checks file type, PDF structure and access permissions. Do not upload confidential documents to public events.
          </p>
        </div>
      </details>
      <details className="group min-w-0 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-bold transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-primary/25 sm:px-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Package className="size-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">Souvenirs &amp; size variants</span>
          <Badge variant="secondary">{products.length}</Badge>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-4 border-t border-border/70 p-4 sm:p-5">
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-800 dark:text-amber-300">Catalogue setup is available now. Paid online merchandise orders, QR collection receipts, and stock reservation are not activated until their payment and fulfilment verification is completed. Do not promise online orders yet.</p>
          {products.map((p) => <div key={p.id} className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 rounded-xl border p-2.5">
            <OrganizerEventCover src={p.imageUrl} title={p.name} />
            <div className="min-w-0"><p className="text-sm font-bold">{p.name}{p.variantLabel ? ` · ${p.variantLabel}` : ''}</p><p className="text-xs text-muted-foreground">{p.sku} · {money(p.priceMinor)} · {Math.max(0, p.stockTotal - p.stockSold - p.stockReserved)} available {!p.active && '· hidden'}</p></div>
            <div className="col-span-2 flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => startProductEdit(p)}><Pencil className="size-4" aria-hidden /> Edit</Button>
              {p.active && <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={busy}
                onClick={() => setPendingRemove({ kind: 'souvenirs', id: p.id, name: p.name })}>
                <Trash2 className="size-4" aria-hidden /> Hide item
              </Button>}
            </div>
          </div>)}
          <div ref={productFormRef} className="scroll-mt-20 border-t border-border/70 pt-4">
            <h4 className="text-sm font-bold">{productEdit ? 'Edit souvenir variant' : 'Add a souvenir or size variant'}</h4>
            <p className="mt-1 text-xs text-muted-foreground">Each size or colour must have its own unique SKU, price and stock figure.</p>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5"><Label htmlFor="souvenir-name">Product name <span className="text-destructive">*</span></Label>
              <Input id="souvenir-name" maxLength={120} value={product.name} onChange={(e) => changeProduct('name', e.target.value)} placeholder="Official event T-shirt" />
            </div>
            <div className="min-w-0 space-y-1.5"><Label htmlFor="souvenir-variant">Size, colour or variant</Label>
              <Input id="souvenir-variant" maxLength={80} value={product.variantLabel} onChange={(e) => changeProduct('variantLabel', e.target.value)} placeholder="Medium · Black" />
            </div>
            <div className="min-w-0 space-y-1.5"><Label htmlFor="souvenir-sku">Unique product code (SKU) <span className="text-destructive">*</span></Label>
              <Input id="souvenir-sku" maxLength={50} value={product.sku} autoComplete="off"
                onChange={(e) => changeProduct('sku', e.target.value.toUpperCase())} placeholder="TS-M-BLK" />
            </div>
            <div className="min-w-0 space-y-1.5"><Label htmlFor="souvenir-price">Price (₵) <span className="text-destructive">*</span></Label>
              <Input id="souvenir-price" inputMode="decimal" value={product.price} onChange={(e) => changeProduct('price', e.target.value)} placeholder="45.00" />
              <FieldHelp>Up to two decimal places. Each size/colour can be priced separately.</FieldHelp>
            </div>
            <div className="min-w-0 space-y-1.5"><Label htmlFor="souvenir-stock">Stock available</Label>
              <Input id="souvenir-stock" type="number" min={0} max={100000} step={1} value={product.stockTotal} onChange={(e) => changeProduct('stockTotal', e.target.value)} />
            </div>
            <div className="min-w-0 space-y-1.5"><Label htmlFor="souvenir-order">Display order</Label>
              <Input id="souvenir-order" type="number" min={0} max={1000} step={1} value={product.sortOrder} onChange={(e) => changeProduct('sortOrder', e.target.value)} />
            </div>
            <div className="min-w-0 space-y-1.5 sm:col-span-2"><Label htmlFor="souvenir-description">Description / collection information</Label>
              <Textarea id="souvenir-description" rows={2} maxLength={1000} value={product.description}
                onChange={(e) => changeProduct('description', e.target.value)} placeholder="Fabric, size guide, collection point or availability information" />
            </div>
            <div className="min-w-0 space-y-1.5 sm:col-span-2"><Label htmlFor="souvenir-photo">Product photo</Label>
              <Input id="souvenir-photo" value={product.imageUrl} maxLength={400} onChange={(e) => changeProduct('imageUrl', e.target.value)} placeholder="Uploaded image URL or secure HTTPS image" />
              <input className="hidden" type="file" ref={productImageRef} accept="image/png,image/jpeg,image/webp"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f, 'MERCH_PHOTO'); e.target.value = '' }} />
              <Button type="button" size="sm" variant="outline" loading={uploading} onClick={() => productImageRef.current?.click()}>
                {!uploading && <ImagePlus className="size-4" aria-hidden />} Upload product photo
              </Button>
              <FieldHelp>PNG, JPEG or WebP, up to 5 MB.</FieldHelp>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/30 p-3 sm:col-span-2">
              <div className="min-w-0">
                <Label htmlFor="souvenir-active" className="font-semibold">Visible in product catalogue</Label>
                <p className="mt-1 text-xs text-muted-foreground">Keep unfinished or unavailable products hidden. Switch on to restore a previously hidden item.</p>
              </div>
              <Switch id="souvenir-active" checked={product.active} onCheckedChange={(on) => changeProduct('active', on)} />
            </div>
          </div>
          {productError && <FieldError>{productError}</FieldError>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="premium" loading={busy} disabled={uploading || !product.name.trim() || !product.sku.trim()}
              onClick={() => void saveProduct()}>
              {!busy && (productEdit ? <CheckCircle2 className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />)}
              {productEdit ? 'Save variant' : 'Add catalogue item'}
            </Button>
            {productEdit && <Button type="button" variant="outline" disabled={busy} onClick={() => { setProduct({ ...blankProduct }); setProductEdit(null); setProductError('') }}>Cancel edit</Button>}
          </div>
        </div>
      </details>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        Use the Agenda section for detailed event time slots. Lineup profiles describe each person's role and individual appearance.
      </p>
      <AlertDialog open={Boolean(pendingRemove)} onOpenChange={(open) => { if (!open && !busy) setPendingRemove(null) }}>
        <AlertDialogContent className="rounded-2xl border-border/80 sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingRemove?.kind === 'souvenirs' ? 'Hide this catalogue item?' : pendingRemove?.kind === 'contributors' ? 'Remove this person?' : 'Remove this programme?'}</AlertDialogTitle>
            <AlertDialogDescription className="break-words leading-relaxed">
              {pendingRemove?.name ? `“${pendingRemove.name}” — ` : ''}
              {pendingRemove?.kind === 'souvenirs'
                ? 'The item will no longer appear in the public catalogue. Existing sales and reservations are retained.'
                : pendingRemove?.kind === 'contributors'
                  ? 'This person will no longer appear in the event lineup.'
                  : 'The selected programme document will be removed from the event page.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void confirmRemove() }}>
              {busy ? 'Updating…' : pendingRemove?.kind === 'souvenirs' ? 'Hide item' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
