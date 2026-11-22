'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarClock, ChevronDown, Clock3, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { api, ApiClientError } from '../api'
import { dateLong } from '../format'
import { agendaFormError, agendaLocalToUtc, agendaUtcToLocal, type AgendaForm } from '../lib/agenda-time'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FieldError, FieldHelp } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

type AgendaItem = {
  id: string; title: string; startsAt: string; endsAt: string | null
  speaker: string | null; description: string | null; sortOrder: number
}
const blank: AgendaForm = {
  title:'', startsAt:'', endsAt:'', speaker:'',description:'',sortOrder:'0',
}
function toMessage(err: unknown, fallback: string) {
  return err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : fallback
}

/** Organizer-only editor. No automatic changes to live event data on mount. */
export function EventAgendaEditor({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<AgendaItem[]>([])
  const [zone, setZone] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<AgendaForm>({ ...blank })
  const [pendingDelete, setPendingDelete] = useState<AgendaItem | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [agenda, eventData] = await Promise.all([
      api.get<{ items: AgendaItem[] }>(`/events/${eventId}/agenda`),
      api.get<{ event: { timezone: string } }>(`/events/${eventId}`),
    ])
    setItems(agenda.items)
    setZone(eventData.event.timezone)
    setError('')
  }, [eventId])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      api.get<{ items: AgendaItem[] }>(`/events/${eventId}/agenda`),
      api.get<{ event: { timezone: string } }>(`/events/${eventId}`),
    ]).then(([agenda,eventData])=>{
      if (!alive) return
      setItems(agenda.items)
      setZone(eventData.event.timezone)
      setError('')
    }).catch(err=>{ if (alive) setError(toMessage(err,'Unable to load the event agenda.')) })
      .finally(()=>{ if(alive) setLoading(false) })
    return () => { alive=false }
  }, [eventId])

  const update = (key: keyof AgendaForm, value: string) => {
    setFormError('')
    setForm(previous => ({ ...previous, [key]:value }))
  }
  const startEdit = (item: AgendaItem) => {
    setEditId(item.id)
    setFormError('')
    setForm({
      title:item.title, startsAt:agendaUtcToLocal(item.startsAt,zone),
      endsAt:item.endsAt ? agendaUtcToLocal(item.endsAt,zone) : '',
      speaker:item.speaker ?? '',description:item.description ?? '',
      sortOrder:String(item.sortOrder),
    })
    formRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' })
  }
  const reset = () => {
    setForm({ ...blank })
    setEditId(null)
    setFormError('')
  }
  const save = async () => {
    if (busy || loading) return
    const issue = agendaFormError(form,zone)
    if (issue) { setFormError(issue);return }
    setBusy(true)
    setFormError('')
    try {
      const payload = {
        title:form.title.trim(),
        startsAt:agendaLocalToUtc(form.startsAt,zone),
        endsAt:form.endsAt ? agendaLocalToUtc(form.endsAt,zone) : null,
        speaker:form.speaker.trim() || null,
        description:form.description.trim() || null,
        sortOrder:Number(form.sortOrder),
      }
      if(editId) await api.patch(`/events/${eventId}/agenda/${editId}`,payload)
      else await api.post(`/events/${eventId}/agenda`,payload)
      await load()
      reset()
    }catch(err){setFormError(toMessage(err,'The agenda slot could not be saved.'))}
    finally{setBusy(false)}
  }
  const remove = async () => {
    if(busy||!pendingDelete)return
    setBusy(true)
    try{
      await api.delete(`/events/${eventId}/agenda/${pendingDelete.id}`)
      await load()
      if(editId===pendingDelete.id)reset()
      setPendingDelete(null)
    }catch(err){setError(toMessage(err,'Could not remove the session.'))}
    finally{setBusy(false)}
  }

  return <details className="group min-w-0 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-bold transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-primary/25 sm:px-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <CalendarClock className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">Detailed agenda &amp; time slots</span>
      <Badge variant="secondary">{items.length}</Badge>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
    </summary>
    <div className="space-y-4 border-t border-border/70 p-4 sm:p-5">
      <p className="text-xs leading-relaxed text-muted-foreground">Build your programme schedule with titles, start/finish times, presenters and descriptions. Entries are shown on the event page in the event's configured timezone.</p>
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <span>{error}</span>
        <Button type="button" size="sm" variant="outline" loading={loading} onClick={() => void load().catch(e=>setError(toMessage(e,'Refresh failed.')))}>
          <RefreshCw className="size-4" aria-hidden /> Retry
        </Button>
      </div>}
      {loading ? <div className="space-y-3" role="status" aria-label="Loading event agenda">
        <div className="h-12 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="h-12 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      </div> : <>
        {items.length ? <ol className="relative space-y-3">
          {items.map((item,index)=><li key={item.id} className="min-w-0 rounded-2xl border border-border/80 bg-muted/20 p-3.5 sm:p-4">
            <div className="flex min-w-0 flex-wrap items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-extrabold tabular-nums text-primary">{String(index+1).padStart(2,'0')}</span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold">{item.title}</p>
                <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Clock3 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                  <span>{dateLong(item.startsAt,zone)}{item.endsAt ? ` – ${dateLong(item.endsAt,zone)}` : ''}</span>
                </p>
                {item.speaker && <p className="mt-1 text-xs font-semibold text-primary">{item.speaker}</p>}
                {item.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{item.description}</p>}
              </div>
              <div className="ml-auto flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={() => startEdit(item)}><Pencil className="size-4" aria-hidden /> Edit</Button>
                <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setPendingDelete(item)}>
                  <Trash2 className="size-4" aria-hidden /> Remove
                </Button>
              </div>
            </div>
          </li>)}
        </ol> : <p className="rounded-xl border border-dashed border-border bg-muted/25 px-4 py-6 text-center text-sm text-muted-foreground">No agenda sessions yet. Add your welcome, speakers, performances and closing programme below.</p>}
        <div ref={formRef} className="scroll-mt-20 border-t border-border/70 pt-4">
          <h4 className="text-sm font-bold">{editId ? 'Edit agenda session' : 'Add agenda session'}</h4>
          <p className="mt-1 text-xs text-muted-foreground">Times below are entered in <strong>{zone || 'the event timezone'}</strong>, not your device's timezone.</p>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor="agenda-title">Session title <span className="text-destructive">*</span></Label>
            <Input id="agenda-title" maxLength={160} value={form.title} placeholder="e.g. Opening worship and welcome" onChange={e=>update('title',e.target.value)} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="agenda-start">Session begins <span className="text-destructive">*</span></Label>
            <Input id="agenda-start" type="datetime-local" value={form.startsAt} onChange={e=>update('startsAt',e.target.value)} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="agenda-finish">Session ends (optional)</Label>
            <Input id="agenda-finish" type="datetime-local" value={form.endsAt} onChange={e=>update('endsAt',e.target.value)} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="agenda-speaker">Speaker / performer (optional)</Label>
            <Input id="agenda-speaker" maxLength={120} value={form.speaker} placeholder="e.g. Guest Speaker" onChange={e=>update('speaker',e.target.value)} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="agenda-order">Display order (0–1,000)</Label>
            <Input id="agenda-order" type="number" min={0} max={1000} step={1} value={form.sortOrder} onChange={e=>update('sortOrder',e.target.value)} />
            <FieldHelp>Lower numbers appear first; equal orders sort by start time.</FieldHelp>
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor="agenda-description">Session details (optional)</Label>
            <Textarea id="agenda-description" maxLength={500} rows={3} value={form.description} placeholder="Describe the programme segment or topic." onChange={e=>update('description',e.target.value)} />
            <FieldHelp>{form.description.length} / 500 characters</FieldHelp>
          </div>
        </div>
        {formError && <FieldError>{formError}</FieldError>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="premium" loading={busy} onClick={()=>void save()} disabled={!form.title.trim() || !zone}>
            {!busy && <Plus className="size-4" aria-hidden />}{editId?'Save session':'Add session'}
          </Button>
          {editId && <Button type="button" variant="outline" disabled={busy} onClick={reset}>Cancel edit</Button>}
        </div>
      </>}
    </div>
    <AlertDialog open={Boolean(pendingDelete)} onOpenChange={open=>{if(!open&&!busy)setPendingDelete(null)}}>
      <AlertDialogContent className="rounded-2xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this agenda session?</AlertDialogTitle>
          <AlertDialogDescription className="break-words">“{pendingDelete?.title}” will disappear from the published programme. This does not affect tickets or registration.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction type="button" className="bg-destructive text-white hover:bg-destructive/90" disabled={busy}
            onClick={e=>{e.preventDefault();void remove()}}>
            {busy?'Removing…':'Remove session'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </details>
}
