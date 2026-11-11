'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Copy, Check, Eye, Sparkles, Filter, Flame, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { api } from '../api'
import { navigate } from '../router'
import { humanize } from '../format'

interface EffectItem {
  id: string
  name: string
  category: string
  description: string
  difficulty: string
  tags: string[]
  cssCode: string
  htmlSnippet: string
  demoKind: string
  views: number
  featured?: boolean
}

/**
 * Effects Studio — the iEventPlux CSS effect library.
 * Every card renders a LIVE demo (scoped `<style>` + raw HTML snippet) and the
 * full CSS/HTML source with one-tap copy. 38 production-grade, self-contained,
 * scoped effects across 10 categories.
 */
export default function EffectsStudio() {
  const { toast } = useToast()
  const [effects, setEffects] = useState<EffectItem[] | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('all')
  const [difficulty, setDifficulty] = useState('all')
  const [selected, setSelected] = useState<EffectItem | null>(null)
  const [copied, setCopied] = useState<'css' | 'html' | null>(null)

  useEffect(() => {
    void api
      .get<{ items: EffectItem[]; categories: string[] }>('/effects')
      .then((data) => {
        setEffects(data.items)
        setCategories(data.categories)
      })
      .catch(() => setEffects([]))
  }, [])

  const filtered = useMemo(() => {
    if (!effects) return []
    const query = q.toLowerCase().trim()
    return effects.filter((e) => {
      if (category !== 'all' && e.category !== category) return false
      if (difficulty !== 'all' && e.difficulty !== difficulty) return false
      if (query && !e.name.toLowerCase().includes(query) && !e.description.toLowerCase().includes(query) && !e.tags.some((t) => t.toLowerCase().includes(query))) return false
      return true
    })
  }, [effects, q, category, difficulty])

  const copy = async (text: string, kind: 'css' | 'html') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1400)
      toast({ title: kind === 'css' ? 'CSS copied' : 'HTML copied', description: 'Paste it into any project — the styles are fully self-contained.' })
    } catch {
      toast({ description: 'Clipboard unavailable — select the code manually.', variant: 'destructive' })
    }
  }

  const openDetail = (effect: EffectItem) => {
    setSelected(effect)
    void api.post(`/effects?slug=${encodeURIComponent(effect.id)}`).catch(() => {})
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-md"><Sparkles className="h-6 w-6" aria-hidden /></span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Effects Studio</h1>
          <p className="text-sm text-muted-foreground">
            The iEventPlux CSS effect library — {effects?.length ?? '…'} live, copy-ready effects powering this portal&apos;s look. Hover, focus and toggle the demos right here.
          </p>
        </div>
        <Button variant="outline" className="ml-auto rounded-full" onClick={() => navigate('/')}>
          <ChevronRight className="h-4 w-4 rotate-180" aria-hidden /> Back to events
        </Button>
      </div>

      {/* Filters */}
      <div className="sticky top-16 z-20 -mx-4 mb-6 border-y border-border/50 bg-background/85 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-44 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search effects… (glow, shimmer, tilt)"
              aria-label="Search CSS effects"
              className="h-10 w-full rounded-full border border-border bg-card pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Tabs value={difficulty} onValueChange={setDifficulty}>
            <TabsList className="rounded-full">
              <TabsTrigger value="all" className="rounded-full text-xs">All levels</TabsTrigger>
              <TabsTrigger value="beginner" className="rounded-full text-xs">Beginner</TabsTrigger>
              <TabsTrigger value="intermediate" className="rounded-full text-xs">Intermediate</TabsTrigger>
              <TabsTrigger value="advanced" className="rounded-full text-xs">Advanced</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="ievx-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCategory('all')}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium ievx-press ${category === 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
          >
            <Filter className="mr-1 inline h-3 w-3" aria-hidden /> All ({effects?.length ?? 0})
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium ievx-press ${category === c ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
            >
              {humanize(c)} ({effects?.filter((e) => e.category === c).length ?? 0})
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {effects === null ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="ievx-skeleton h-72 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-secondary/30 px-6 py-16 text-center">
          <p className="font-semibold">No effects match “{q}”</p>
          <p className="mt-1 text-sm text-muted-foreground">Try another keyword or clear the filters.</p>
          <Button className="mt-4 rounded-full" variant="outline" onClick={() => { setQ(''); setCategory('all'); setDifficulty('all') }}>Clear filters</Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((effect, i) => (
            <Card key={effect.id} className="ievx-card-hover overflow-hidden rounded-2xl" style={{ animationDelay: `${Math.min(i * 35, 350)}ms` }}>
              {/* LIVE DEMO stage */}
              <div className="flex min-h-56 items-center justify-center border-b border-border/60 bg-gradient-to-br from-secondary/40 to-background p-6">
                <style dangerouslySetInnerHTML={{ __html: effect.cssCode }} />
                <div className="ievx-fade w-full overflow-hidden" key={effect.id} dangerouslySetInnerHTML={{ __html: effect.htmlSnippet }} />
              </div>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-snug">{effect.name}</h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{effect.description}</p>
                  </div>
                  {effect.featured && <Badge className="gap-1 shrink-0 bg-accent text-accent-foreground"><Flame className="h-3 w-3" /> Hot</Badge>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px] capitalize">{humanize(effect.category)}</Badge>
                  <Badge variant="secondary" className="text-[10px] capitalize">{effect.difficulty}</Badge>
                  {effect.demoKind === 'interactive' && <Badge variant="secondary" className="text-[10px]">interactive</Badge>}
                  {effect.tags.slice(0, 2).map((t) => <Badge key={t} variant="outline" className="text-[10px] text-muted-foreground">#{t}</Badge>)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><Eye className="h-3.5 w-3.5" aria-hidden /> {effect.views.toLocaleString()}</span>
                  <Button size="sm" className="rounded-full ievx-press" onClick={() => openDetail(effect)}>View code</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Code dialog */}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {selected.name}
                  <Badge variant="outline" className="capitalize">{humanize(selected.category)}</Badge>
                  <Badge variant="secondary" className="capitalize">{selected.difficulty}</Badge>
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{selected.description}</p>
              <div className="flex min-h-40 items-center justify-center rounded-xl border border-border bg-gradient-to-br from-secondary/40 to-background p-6">
                <style dangerouslySetInnerHTML={{ __html: selected.cssCode }} />
                <div className="ievx-scale" dangerouslySetInnerHTML={{ __html: selected.htmlSnippet }} />
              </div>
              <div className="space-y-3">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">CSS</p>
                    <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={() => void copy(selected.cssCode, 'css')}>
                      {copied === 'css' ? <Check className="mr-1 h-3 w-3 text-primary" /> : <Copy className="mr-1 h-3 w-3" />} Copy CSS
                    </Button>
                  </div>
                  <pre className="ievx-scrollbar max-h-56 overflow-auto rounded-xl bg-foreground p-4 text-[11.5px] leading-relaxed text-background"><code>{selected.cssCode}</code></pre>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">HTML</p>
                    <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={() => void copy(selected.htmlSnippet, 'html')}>
                      {copied === 'html' ? <Check className="mr-1 h-3 w-3 text-primary" /> : <Copy className="mr-1 h-3 w-3" />} Copy HTML
                    </Button>
                  </div>
                  <pre className="ievx-scrollbar max-h-40 overflow-auto rounded-xl bg-foreground p-4 text-[11.5px] leading-relaxed text-background"><code>{selected.htmlSnippet}</code></pre>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">#{t}</Badge>)}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
