'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Sparkles, Loader2, Download, Wand2, Type, Share2, ImageIcon,
  LibraryBig, LogIn, Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { api } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'

/**
 * AI Content Studio — organizer tooling powered by real AI calls:
 *  • Description writer  → summary + markdown description + tags (JSON contract)
 *  • Social captions     → WhatsApp / X / Instagram launch captions
 *  • Poster designer     → AI image generation (864×1152), downloadable + savable
 * Generated text is a draft the organizer stays in control of (editable before use).
 */

interface DescResult { summary: string; description: string; tags: string[] }
interface CaptionResult { whatsapp: string; x: string; instagram: string }

const TONES = ['Professional', 'Warm & welcoming', 'Fun & energetic', 'Inspirational', 'Formal']
const VIBES = ['modern & vibrant', 'elegant & minimal', 'afro-futurist', 'corporate & clean', 'festival energy', 'sacred & serene']
const PALETTES = [
  'emerald green and warm gold on deep charcoal',
  'sunset orange fading into deep purple',
  'clean white and royal green, minimal',
  'neon cyan and magenta on black',
  'soft pastel cream with terracotta accents',
]

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  return (
    <label
      className="efx-copy-success-checkmark"
      style={{ margin: 0, opacity: text ? undefined : 0.6, pointerEvents: text ? undefined : 'none' }}
    >
      <input
        type="checkbox"
        className="efx-copy-success-checkmark__input"
        checked={copied}
        onChange={() => {}}
        aria-label={copied ? `${label} copied to clipboard` : `Copy ${label}`}
        onClick={async () => {
          if (!text) return
          const ok = await copyText(text)
          if (ok) {
            setCopied(true)
            toast({ title: `${label} copied`, description: 'Paste it anywhere — the text is on your clipboard.' })
            setTimeout(() => setCopied(false), 1800)
          } else {
            toast({ title: 'Copy failed', description: 'Select the text manually and copy it.', variant: 'destructive' })
          }
        }}
      />
      <span className="efx-copy-success-checkmark__button">
        <span className="efx-copy-success-checkmark__badge" aria-hidden="true">
          <svg className="efx-copy-success-checkmark__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path className="efx-copy-success-checkmark__path" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span className="efx-copy-success-checkmark__text">
          <span className="efx-copy-success-checkmark__text-copy">Copy</span>
          <span className="efx-copy-success-checkmark__text-done">Copied!</span>
        </span>
      </span>
    </label>
  )
}

export default function AiStudio() {
  const { user, memberships, activeOrgId } = usePortal()
  const { toast } = useToast()
  const org = useMemo(() => memberships.find((m) => m.orgId === activeOrgId) ?? memberships[0] ?? null, [memberships, activeOrgId])

  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([])

  useEffect(() => {
    void api.get<{ categories: { slug: string; name: string }[] }>('/discovery/categories')
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => setCategories([]))
  }, [])

  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-3xl border border-border/60 bg-card p-10 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><LogIn className="h-7 w-7" /></span>
          <h1 className="text-xl font-bold">AI Content Studio</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to write event descriptions, social captions and generate posters with AI.</p>
          <Button className="mt-6 rounded-full" onClick={() => navigate('/signin')}>Sign in to continue</Button>
        </div>
      </div>
    )
  }

  if (memberships.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-3xl border border-border/60 bg-card p-10 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Building2 className="h-7 w-7" /></span>
          <h1 className="text-xl font-bold">AI Content Studio</h1>
          <p className="mt-2 text-sm text-muted-foreground">The studio helps organizers promote their events. Create an organization first — it takes about a minute.</p>
          <Button className="mt-6 rounded-full" onClick={() => navigate('/create-org')}>Start organizing</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
            <Sparkles className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h1 className="efx-animated-gradient-text iefx-headline text-2xl font-extrabold tracking-tight">AI Content Studio</h1>
            <p className="text-sm text-muted-foreground">
              Drafting for <span className="font-semibold text-foreground">{org.orgName}</span> — everything here is an editable draft.
            </p>
          </div>
          {memberships.length > 1 && (
            <div className="ml-auto">
              <Select value={org.orgId} onValueChange={(v) => usePortal.getState().setActiveOrg(v)}>
                <SelectTrigger className="w-48 rounded-full" aria-label="Switch organization"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {memberships.map((m) => (
                    <SelectItem key={m.orgId} value={m.orgId}>{m.orgName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </header>

      <Tabs defaultValue="description">
        <TabsList className="mb-5 h-11 rounded-full p-1">
          <TabsTrigger value="description" className="rounded-full px-4"><Type className="mr-1.5 h-4 w-4" aria-hidden /> Description</TabsTrigger>
          <TabsTrigger value="captions" className="rounded-full px-4"><Share2 className="mr-1.5 h-4 w-4" aria-hidden /> Social captions</TabsTrigger>
          <TabsTrigger value="poster" className="rounded-full px-4"><ImageIcon className="mr-1.5 h-4 w-4" aria-hidden /> Poster</TabsTrigger>
        </TabsList>

        {/* ── Description writer ── */}
        <TabsContent value="description">
          <DescriptionTab categories={categories} />
        </TabsContent>

        {/* ── Social captions ── */}
        <TabsContent value="captions">
          <CaptionsTab />
        </TabsContent>

        {/* ── Poster designer ── */}
        <TabsContent value="poster">
          <PosterTab orgId={org.orgId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Description writer ────────────────────────────────────────────────────────

function DescriptionTab({ categories }: { categories: { slug: string; name: string }[] }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ title: '', category: '', city: '', dateText: '', audience: '', tone: 'Professional', notes: '' })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DescResult | null>(null)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const generate = async () => {
    if (form.title.trim().length < 2) {
      toast({ title: 'Title required', description: 'Give the event a title first.' })
      return
    }
    setLoading(true)
    try {
      const data = await api.post<DescResult>('/ai/studio', { kind: 'description', ...form })
      setResult(data)
    } catch (err) {
      toast({ title: 'Generation failed', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-3xl border border-border/60 bg-card p-5 sm:p-6">
        <h2 className="font-bold">The brief</h2>
        <p className="mb-4 text-xs text-muted-foreground">Only real details — the AI will not invent facts.</p>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="d-title">Event title *</Label>
              <Input id="d-title" value={form.title} onChange={set('title')} maxLength={140} placeholder="e.g. Accra Praise Night 2025" className="mt-1.5" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, category: v === 'none' ? '' : v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick a category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {categories.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="d-city">City / venue</Label>
              <Input id="d-city" value={form.city} onChange={set('city')} maxLength={120} placeholder="e.g. Accra International Conference Centre" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="d-date">Date & time (text)</Label>
              <Input id="d-date" value={form.dateText} onChange={set('dateText')} maxLength={80} placeholder="e.g. Friday 19 December, 7 PM" className="mt-1.5" />
            </div>
            <div>
              <Label>Tone</Label>
              <Select value={form.tone} onValueChange={(v) => setForm((f) => ({ ...f, tone: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="d-audience">Audience</Label>
              <Input id="d-audience" value={form.audience} onChange={set('audience')} maxLength={200} placeholder="e.g. young professionals, church youth groups" className="mt-1.5" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="d-notes">Key notes (line-up, tickets, perks…)</Label>
              <div className="efx-glow-focus-input" style={{ margin: '0.375rem 0 0', maxWidth: '100%' }}>
                <Wand2 className="efx-glow-focus-input__icon" aria-hidden />
                <Textarea
                  id="d-notes"
                  value={form.notes}
                  onChange={set('notes')}
                  maxLength={1200}
                  rows={4}
                  placeholder="Bullet points are fine — the AI will turn them into flowing copy."
                  className="efx-glow-focus-input__field"
                  style={{ margin: 0, maxWidth: '100%' }}
                />
              </div>
            </div>
          </div>
          <Button
            className="efx-shine-sweep-button w-full"
            onClick={generate}
            disabled={loading}
            style={{
              borderRadius: '999px',
              fontSize: '0.92rem',
              padding: '0.65rem 1.5rem',
              cursor: loading ? 'not-allowed' : undefined,
              opacity: loading ? 0.6 : undefined,
            }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {loading ? 'Writing…' : 'Generate description'}
          </Button>
        </div>
      </div>

      <div className="rounded-3xl border border-border/60 bg-card p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Draft</h2>
          {result && <CopyButton text={`Summary: ${result.summary}\n\n${result.description}\n\nTags: ${result.tags.join(', ')}`} label="Full draft" />}
        </div>
        {loading ? (
          <div className="space-y-3" aria-live="polite">
            <div className="ievx-skeleton h-5 w-3/4 rounded" />
            <div className="ievx-skeleton h-4 w-full rounded" />
            <div className="ievx-skeleton h-4 w-11/12 rounded" />
            <div className="ievx-skeleton h-4 w-4/5 rounded" />
            <div className="ievx-skeleton h-24 w-full rounded-xl" />
          </div>
        ) : result ? (
          <div className="space-y-4" aria-live="polite">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Summary (event card)</Label>
                <CopyButton text={result.summary} label="Summary" />
              </div>
              <Textarea value={result.summary} readOnly rows={2} className="bg-secondary/40" />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Description (markdown)</Label>
                <CopyButton text={result.description} label="Description" />
              </div>
              <Textarea value={result.description} readOnly rows={12} className="bg-secondary/40 leading-relaxed" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tags</Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {result.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Paste this into the event editor in your Organizer Workspace when you are happy with it.</p>
          </div>
        ) : (
          <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/30 p-8 text-center">
            <Type className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Your generated copy appears here</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">Fill the brief and press Generate — you get a card summary, a full description and tags.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Social captions ───────────────────────────────────────────────────────────

function CaptionsTab() {
  const { toast } = useToast()
  const [form, setForm] = useState({ title: '', dateText: '', city: '', highlights: '', link: '' })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CaptionResult | null>(null)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const generate = async () => {
    if (form.title.trim().length < 2) {
      toast({ title: 'Title required', description: 'Give the event a title first.' })
      return
    }
    setLoading(true)
    try {
      const data = await api.post<CaptionResult>('/ai/studio', { kind: 'captions', ...form })
      setResult(data)
    } catch (err) {
      toast({ title: 'Generation failed', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const channels: { key: keyof CaptionResult; label: string; hint: string }[] = [
    { key: 'whatsapp', label: 'WhatsApp broadcast', hint: 'Warm, emoji-friendly group message' },
    { key: 'x', label: 'X (Twitter) post', hint: 'Punchy, hashtag-light' },
    { key: 'instagram', label: 'Instagram caption', hint: 'Caption + hashtags' },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-3xl border border-border/60 bg-card p-5 sm:p-6">
        <h2 className="font-bold">Launch details</h2>
        <p className="mb-4 text-xs text-muted-foreground">The same facts, tuned per platform.</p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="c-title">Event title *</Label>
            <Input id="c-title" value={form.title} onChange={set('title')} maxLength={140} placeholder="e.g. Lagos Tech Summit" className="mt-1.5" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="c-date">Date & time (text)</Label>
              <Input id="c-date" value={form.dateText} onChange={set('dateText')} maxLength={80} placeholder="e.g. Sat 14 June, 6 PM" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="c-city">Location</Label>
              <Input id="c-city" value={form.city} onChange={set('city')} maxLength={120} placeholder="e.g. Accra Sports Complex" className="mt-1.5" />
            </div>
          </div>
          <div>
            <Label htmlFor="c-high">Highlights</Label>
            <Textarea id="c-high" value={form.highlights} onChange={set('highlights')} maxLength={800} rows={3} placeholder="Headliners, giveaways, early-bird pricing…" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="c-link">Ticket link (optional)</Label>
            <Input id="c-link" value={form.link} onChange={set('link')} maxLength={200} placeholder="https://ieventplux.gh/#/event/…" className="mt-1.5" />
          </div>
          <Button
            className="efx-shine-sweep-button w-full"
            onClick={generate}
            disabled={loading}
            style={{
              borderRadius: '999px',
              fontSize: '0.92rem',
              padding: '0.65rem 1.5rem',
              cursor: loading ? 'not-allowed' : undefined,
              opacity: loading ? 0.6 : undefined,
            }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            {loading ? 'Writing…' : 'Generate captions'}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {loading && (
          <div className="space-y-3 rounded-3xl border border-border/60 bg-card p-5">
            <div className="ievx-skeleton h-4 w-1/3 rounded" />
            <div className="ievx-skeleton h-20 w-full rounded-xl" />
            <div className="ievx-skeleton h-4 w-1/4 rounded" />
            <div className="ievx-skeleton h-14 w-full rounded-xl" />
          </div>
        )}
        {!loading && channels.map((ch) => (
          <div key={ch.key} className="rounded-3xl border border-border/60 bg-card p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">{ch.label}</h3>
                <p className="text-[11px] text-muted-foreground">{ch.hint}</p>
              </div>
              <CopyButton text={result?.[ch.key] ?? ''} label={ch.label} />
            </div>
            {result ? (
              <Textarea value={result[ch.key]} readOnly rows={ch.key === 'whatsapp' ? 5 : ch.key === 'instagram' ? 5 : 3} className="bg-secondary/40 text-sm leading-relaxed" aria-label={`${ch.label} caption`} />
            ) : (
              <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-border bg-secondary/30 text-xs text-muted-foreground">
                Generated {ch.label.toLowerCase()} appears here
              </div>
            )}
            {result && <p className="mt-1.5 text-right text-[11px] text-muted-foreground">{result[ch.key].length} characters</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Poster designer ───────────────────────────────────────────────────────────

function PosterTab({ orgId }: { orgId: string }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ title: '', dateText: '', city: '', vibe: VIBES[0], palette: PALETTES[0] })
  const [loading, setLoading] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const generate = async () => {
    if (form.title.trim().length < 2) {
      toast({ title: 'Title required', description: 'Give the poster its headline first.' })
      return
    }
    setLoading(true)
    setSavedUrl(null)
    try {
      const data = await api.post<{ imageBase64: string; mimeType: string }>('/ai/studio', { kind: 'poster', ...form })
      setImage(`data:${data.mimeType};base64,${data.imageBase64}`)
    } catch (err) {
      toast({ title: 'Poster generation failed', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const download = () => {
    if (!image) return
    const a = document.createElement('a')
    a.href = image
    a.download = `${form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'poster'}-ai.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const saveToLibrary = async () => {
    if (!image) return
    setSaving(true)
    try {
      const blob = await (await fetch(image)).blob()
      const file = new File([blob], 'ai-poster.png', { type: 'image/png' })
      const fd = new FormData()
      fd.append('file', file)
      fd.append('orgId', orgId)
      fd.append('kind', 'POSTER')
      fd.append('caption', `AI poster — ${form.title}`.slice(0, 200))
      const res = await api.upload<{ asset: { url: string } }>('/uploads', fd)
      setSavedUrl(res.asset.url)
      toast({ title: 'Saved to media library', description: 'Use it as an event cover from your Organizer Workspace.' })
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-3xl border border-border/60 bg-card p-5 sm:p-6">
        <h2 className="font-bold">Poster brief</h2>
        <p className="mb-4 text-xs text-muted-foreground">Portrait 864×1152 — matches event cards across the app.</p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="p-title">Headline *</Label>
            <Input id="p-title" value={form.title} onChange={set('title')} maxLength={140} placeholder="e.g. Nights of Grace" className="mt-1.5" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="p-date">Date line</Label>
              <Input id="p-date" value={form.dateText} onChange={set('dateText')} maxLength={80} placeholder="e.g. 24 Aug · 7PM" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="p-city">Location line</Label>
              <Input id="p-city" value={form.city} onChange={set('city')} maxLength={120} placeholder="e.g. Kumasi Sports Stadium" className="mt-1.5" />
            </div>
          </div>
          <div>
            <Label>Visual vibe</Label>
            <Select value={form.vibe} onValueChange={(v) => setForm((f) => ({ ...f, vibe: v }))}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{VIBES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Colour palette</Label>
            <Select value={form.palette} onValueChange={(v) => setForm((f) => ({ ...f, palette: v }))}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{PALETTES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button
            className="efx-shine-sweep-button w-full"
            onClick={generate}
            disabled={loading}
            style={{
              borderRadius: '999px',
              fontSize: '0.92rem',
              padding: '0.65rem 1.5rem',
              cursor: loading ? 'not-allowed' : undefined,
              opacity: loading ? 0.6 : undefined,
            }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {loading ? 'Designing… (about 20–40s)' : 'Generate poster'}
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            AI image generation paints the text into the artwork — regenerate if any lettering came out imperfect, or add final text in your design tool after downloading.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-border/60 bg-card p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Preview</h2>
          {image && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={download}>
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
              <Button type="button" size="sm" className="rounded-full" onClick={saveToLibrary} disabled={saving || Boolean(savedUrl)}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LibraryBig className="h-3.5 w-3.5" />}
                {savedUrl ? 'Saved' : 'Save to library'}
              </Button>
            </div>
          )}
        </div>
        <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-secondary/30">
          {loading ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center" aria-live="polite" role="status">
              <span className="efx-dual-ring-loader" aria-hidden="true" style={{ margin: 0, transform: 'scale(0.485)' }} />
              <p className="text-sm text-muted-foreground">Generating your poster…</p>
            </div>
          ) : image ? (
            <div className="group relative overflow-hidden rounded-2xl">
              <img src={image} alt={`AI generated poster for ${form.title}`} className="max-h-[560px] w-full object-contain" />
              <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-500 bg-gradient-to-t from-black/85 to-transparent p-3 text-white">
                <p className="text-sm font-bold">{form.title}</p>
                {(form.dateText || form.city) && (
                  <p className="text-xs text-white/80">{[form.dateText, form.city].filter(Boolean).join(' · ')}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center p-10 text-center">
              <ImageIcon className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">Your poster appears here</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">Generate, download it, or save it straight into this organization&apos;s media library.</p>
            </div>
          )}
        </div>
        {savedUrl && (
          <p className="mt-3 break-all rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
            Saved to <span className="font-mono text-foreground">{savedUrl}</span>
          </p>
        )}
      </div>
    </div>
  )
}
