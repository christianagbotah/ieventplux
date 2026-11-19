'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Loader2, RotateCcw, Sparkles, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'

type Draft = { summary: string; description: string; tags?: string[] }

export function EventCopyCopilot({ orgId, title, category, city, dateText, onApply, onUndo, canUndo }: {
  orgId: string
  title: string
  category: string
  city: string
  dateText: string
  onApply: (draft: { summary: string; description: string }) => void
  onUndo: () => void
  canUndo: boolean
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [tone, setTone] = useState('Professional')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [generatedFor, setGeneratedFor] = useState('')
  const [error, setError] = useState('')
  const [aiReady, setAiReady] = useState<'checking' | 'ready' | 'disabled'>('checking')

  useEffect(() => {
    let active = true
    void api.get<{ integrations?: { key: string; configured: boolean; mode: string }[] }>('/health')
      .then(({ integrations }) => {
        if (!active) return
        const ai = integrations?.find((item) => item.key === 'ai-concierge')
        setAiReady(ai?.configured && ai.mode === 'real' ? 'ready' : 'disabled')
      })
      .catch(() => { if (active) setAiReady('disabled') })
    return () => { active = false }
  }, [])

  const generate = async () => {
    if (aiReady !== 'ready') return setError('The AI provider is not available on this deployment. Continue writing manually.')
    if (title.trim().length < 3) return setError('Enter an event title first.')
    setError('')
    setBusy(true)
    try {
      const result = await api.post<Draft>('/ai/studio', {
        kind: 'description', orgId, title: title.trim(), category, city, dateText, tone, notes: notes.trim(),
      })
      if (!result.summary?.trim() && !result.description?.trim()) throw new Error('No usable description was returned. Add more details and retry.')
      setDraft({ summary: result.summary?.slice(0, 200) ?? '', description: result.description?.slice(0, 4000) ?? '', tags: result.tags })
      setGeneratedFor(title.trim())
      toast({ title: 'AI draft ready', description: 'Review and edit before applying; your event has not changed.' })
    } catch (reason) {
      setDraft(null)
      setError(reason instanceof ApiClientError ? reason.message : reason instanceof Error ? reason.message : 'AI is unavailable. Continue writing manually.')
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/[.035] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="size-4" /></span>
          <div><p className="text-sm font-bold">AI Event Copywriter</p><p className="text-xs text-muted-foreground">Create compelling event copy inside this form</p></div>
        </div>
        <Button type="button" size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide writer' : 'Open AI writer'} {open ? <ChevronUp className="ml-1 size-4" /> : <ChevronDown className="ml-1 size-4" />}
        </Button>
      </div>
      {open && <div className="mt-4 space-y-3 border-t border-primary/10 pt-4">
        {aiReady !== 'ready' && <p role="status" className="rounded-lg border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">{aiReady === 'checking' ? 'Checking AI provider availability…' : 'AI writing is not activated in this deployment. You can still enter or edit your event summary and description manually.'}</p>}
        <p className="text-xs leading-relaxed text-muted-foreground">The writer uses the event facts you provide. Generated statements must be checked before publishing. Nothing is saved without your approval.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="copy-tone">Writing style</Label><Input id="copy-tone" value={tone} maxLength={40} onChange={(e) => setTone(e.target.value)} placeholder="Professional, welcoming…" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="copy-notes">Confirmed event highlights</Label><Textarea id="copy-notes" rows={3} value={notes} maxLength={1100} onChange={(e) => setNotes(e.target.value)} placeholder="Speakers, programme, audience, verified venue details — only facts you can confirm." /></div>
        </div>
        <Button type="button" disabled={busy || title.trim().length < 3 || aiReady !== 'ready'} onClick={() => void generate()}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <WandSparkles className="mr-2 size-4" />}{busy ? 'Writing from your brief…' : draft ? 'Regenerate copy' : 'Generate AI description'}
        </Button>
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">{error}</p>}
        {draft && <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
          <p className="text-xs font-semibold text-primary">AI-generated preview · for {generatedFor}</p>
          <div className="space-y-1.5"><Label htmlFor="copy-summary">Suggested summary</Label><Textarea id="copy-summary" rows={2} maxLength={200} value={draft.summary} onChange={(e) => setDraft((current) => current ? { ...current, summary: e.target.value } : null)} /></div>
          <div className="space-y-1.5"><Label htmlFor="copy-description">Suggested description</Label><Textarea id="copy-description" rows={7} maxLength={4000} value={draft.description} onChange={(e) => setDraft((current) => current ? { ...current, description: e.target.value } : null)} /></div>
          {!!draft.tags?.length && <p className="text-xs text-muted-foreground">Suggested topics: {draft.tags.slice(0, 6).join(' · ')} (not automatically saved)</p>}
          {generatedFor !== title.trim() && <p role="status" className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">The event title changed. Regenerate this draft before applying.</p>}
          <p className="text-xs text-muted-foreground">Applying replaces the current summary and description in this unsaved form. You can undo before saving.</p>
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={generatedFor !== title.trim() || (!draft.summary.trim() && !draft.description.trim())} onClick={() => { onApply(draft); toast({ title: 'AI copy applied', description: 'Review the fields, then save the event when ready.' }) }}><Check className="mr-1.5 size-4" /> Apply to form</Button>{canUndo && <Button type="button" size="sm" variant="outline" onClick={onUndo}><RotateCcw className="mr-1.5 size-4" /> Undo</Button>}</div>
        </div>}
        {!draft && canUndo && <Button type="button" size="sm" variant="ghost" onClick={onUndo}><RotateCcw className="mr-1.5 size-4" /> Undo AI copy</Button>}
      </div>}
    </div>
  )
}
