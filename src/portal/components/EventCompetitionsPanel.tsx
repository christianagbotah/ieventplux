'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trophy, Vote, CheckCircle2, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog-provider'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { connectRealtime } from '../realtime'
import { navigate } from '../router'
import { usePortal } from '../store'

type Nominee = { id: string; name: string; bio: string | null; photoUrl: string | null; votes: number | null }
type Category = { id: string; title: string; myNomineeId: string | null; totalVotes: number | null; nominees: Nominee[] }
type Competition = {
  id: string; title: string; description: string | null; status: string
  canVote: boolean; countsVisible: boolean; totalVotes: number | null
  votingStartsAt: string; votingEndsAt: string; resultsVisibility: string; categories: Category[]
}
type DraftCategory = { title: string; nominees: string }
const blankCategory = (): DraftCategory => ({ title: '', nominees: '' })
function localDate(offsetHours: number) {
  const d = new Date(Date.now() + offsetHours * 3600000)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function EventCompetitionsPanel({ eventId, canManage }: { eventId: string; canManage: boolean }) {
  const { user } = usePortal()
  const confirm = useConfirm()
  const { toast } = useToast()
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [starts, setStarts] = useState(() => localDate(0.25))
  const [ends, setEnds] = useState(() => localDate(24 * 7))
  const [visibility, setVisibility] = useState('AFTER_CLOSE')
  const [draftCategories, setDraftCategories] = useState<DraftCategory[]>([blankCategory()])

  const fromISO = (iso: string) => {
    const date = new Date(iso)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }

  function beginNew() {
    setDraftId(null)
    setTitle('')
    setDescription('')
    setStarts(localDate(0.25))
    setEnds(localDate(24 * 7))
    setVisibility('AFTER_CLOSE')
    setDraftCategories([blankCategory()])
    setEditing(true)
  }

  function beginEdit(contest: Competition) {
    setDraftId(contest.id)
    setTitle(contest.title)
    setDescription(contest.description ?? '')
    setStarts(fromISO(contest.votingStartsAt))
    setEnds(fromISO(contest.votingEndsAt))
    setVisibility(contest.resultsVisibility)
    setDraftCategories(contest.categories.map(category => ({
      title: category.title,
      nominees: category.nominees.map(nominee =>
        nominee.name +
        (nominee.bio || nominee.photoUrl ? ' | ' + (nominee.bio ?? '') : '') +
        (nominee.photoUrl ? ' | ' + nominee.photoUrl : '')
      ).join('\n'),
    })))
    setEditing(true)
  }

  async function discard(contest: Competition) {
    if (busy) return
    const approved = await confirm({
      title: 'Delete this draft competition?',
      description: 'Only unvoted drafts can be deleted. Removing categories and nominations cannot be undone.',
      confirmLabel: 'Delete draft',
      tone: 'danger',
    })
    if (!approved) return
    setBusy(true)
    try {
      await api.delete('/competitions/' + contest.id)
      await refresh()
      toast({ title: 'Draft competition deleted' })
    } catch (cause) {
      toast({ title: 'Unable to delete draft', description: cause instanceof ApiClientError ? cause.message : 'Try again.', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const refresh = useCallback(async () => {
    try {
      const result = await api.get<{ competitions: Competition[] }>('/events/' + eventId + '/competitions')
      setCompetitions(result.competitions)
      setError('')
    } catch (cause) {
      setCompetitions([])
      setError(cause instanceof ApiClientError ? cause.message : 'Could not load award nominations.')
    } finally { setLoading(false) }
  }, [eventId])

  useEffect(() => { void refresh() }, [refresh, user?.id])
  useEffect(() => {
    const socket = connectRealtime()
    const join = () => socket.emit('join', { room: 'event:' + eventId })
    const updated = () => void refresh()
    socket.on('connect', join)
    if (socket.connected) join()
    socket.on('competition:changed', updated)
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 30000)
    return () => { window.clearInterval(timer); socket.off('connect', join); socket.off('competition:changed', updated); socket.disconnect() }
  }, [eventId, refresh])

  async function setStatus(contest: Competition, action: 'open' | 'close') {
    if (busy) return
    const approved = await confirm({
      title: action === 'open' ? 'Open supporter voting?' : 'Close supporter voting?',
      description: action === 'open' ? 'Supporters can cast one free vote in each award category during the voting window.'
        : 'No new votes will be accepted after this competition is closed.',
      confirmLabel: action === 'open' ? 'Open voting' : 'Close voting',
      tone: action === 'close' ? 'danger' : 'normal',
    })
    if (!approved) return
    setBusy(true)
    try {
      await api.post('/competitions/' + contest.id + '/' + action, {})
      await refresh()
      toast({ title: 'Competition updated' })
    } catch (cause) {
      toast({ title: 'Unable to update competition', description: cause instanceof ApiClientError ? cause.message : 'Try again.', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  async function vote(contest: Competition, category: Category, nominee: Nominee) {
    if (!user) { navigate('/signin'); return }
    if (busy || !contest.canVote || category.myNomineeId) return
    const approved = await confirm({
      title: 'Vote for ' + nominee.name + '?',
      description: 'You are using your one free vote for ' + category.title + '. Your choice cannot be changed.',
      confirmLabel: 'Confirm free vote',
    })
    if (!approved) return
    setBusy(true)
    try {
      await api.post('/competitions/' + contest.id + '/vote', { categoryId: category.id, nomineeId: nominee.id })
      await refresh()
      toast({ title: 'Vote counted', description: 'Your vote was recorded securely.' })
    } catch (cause) {
      await refresh()
      toast({ title: 'Vote not accepted', description: cause instanceof ApiClientError ? cause.message : 'Try again.', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  async function create() {
    if (busy) return
    if (Number.isNaN(new Date(starts).getTime()) || Number.isNaN(new Date(ends).getTime())) {
      toast({ title: 'Enter valid voting dates', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const payload = {
        title, description, votingMethod: 'FREE',
        votingStartsAt: new Date(starts).toISOString(), votingEndsAt: new Date(ends).toISOString(),
        resultsVisibility: visibility,
        categories: draftCategories.map(item => ({
          title: item.title,
          nominees: item.nominees.split(/\r?\n/).map(line => {
            const [name, bio, photoUrl] = line.split('|').map(piece => piece.trim())
            return { name, ...(bio ? { bio } : {}), ...(photoUrl ? { photoUrl } : {}) }
          }).filter(n => n.name),
        })),
      }
      if (draftId) await api.patch('/competitions/' + draftId, payload)
      else await api.post('/events/' + eventId + '/competitions', payload)
      await refresh()
      setEditing(false)
      setDraftId(null)
      setTitle('')
      setDraftCategories([blankCategory()])
      toast({ title: draftId ? 'Award draft updated' : 'Competition draft created', description: 'Review all nominations before opening public voting.' })
    } catch (cause) {
      toast({ title: 'Could not create competition', description: cause instanceof ApiClientError ? cause.message : 'Check the names and voting dates.', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  if (loading && !competitions.length) return <Card className="rounded-2xl"><CardContent className="flex items-center gap-2 p-5 text-sm"><Loader2 className="size-4 animate-spin" /> Loading awards…</CardContent></Card>
  if (!canManage && !competitions.length) return null

  return <section id="awards" className="scroll-mt-24 space-y-3" aria-label="Award competitions and voting">
    <Card className="overflow-hidden rounded-2xl border-primary/20">
      <CardHeader className="bg-gradient-to-r from-amber-500/10 via-primary/5 to-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><Badge variant="outline" className="mb-2"><Trophy className="mr-1 size-3" /> Awards & competitions</Badge>
            <CardTitle>Support your favourites</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Vote for pageant contestants, artists and talented performers. Free voting is audited.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void refresh()}>Refresh</Button>
            {canManage && <Button size="sm" onClick={beginNew}><Plus className="mr-1 size-4" /> New awards</Button>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {!competitions.length && <p className="text-sm text-muted-foreground">No award competitions yet.</p>}
        {competitions.map(contest => <article key={contest.id} className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 font-extrabold"><Trophy className="size-5 text-amber-600" /> {contest.title}</h3>
              {contest.description && <p className="mt-1 text-sm text-muted-foreground">{contest.description}</p>}
              <p className="mt-1 text-xs text-muted-foreground">Voting: {new Date(contest.votingStartsAt).toLocaleString()} – {new Date(contest.votingEndsAt).toLocaleString()}</p>
              <div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline">{contest.status}</Badge><Badge variant="outline">{contest.countsVisible ? String(contest.totalVotes ?? 0) + ' votes' : 'Results withheld'}</Badge></div>
            </div>
            {canManage && contest.status === 'DRAFT' && <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => beginEdit(contest)}>Edit draft</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void discard(contest)}>Delete draft</Button>
              <Button size="sm" disabled={busy} onClick={() => void setStatus(contest, 'open')}>Open voting</Button>
            </div>}
            {canManage && contest.status === 'OPEN' && <Button variant="outline" size="sm" disabled={busy} onClick={() => void setStatus(contest, 'close')}>Close voting</Button>}
          </div>
          {contest.categories.map(category => <div key={category.id} className="space-y-3 rounded-xl bg-muted/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-extrabold">{category.title}</h4>
              <span className="text-xs text-muted-foreground">{category.myNomineeId ? 'Your vote recorded' : contest.countsVisible ? String(category.totalVotes ?? 0) + ' votes' : 'Results announced later'}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">{category.nominees.map(nominee => {
              const selected = category.myNomineeId === nominee.id
              const pct = contest.countsVisible && category.totalVotes ? Math.round((nominee.votes ?? 0) * 100 / category.totalVotes) : 0
              return <div key={nominee.id} className={'rounded-xl border bg-card p-3 ' + (selected ? 'border-primary' : '')}>
                <div className="flex items-center gap-3">{nominee.photoUrl ? <img alt="" src={nominee.photoUrl} loading="lazy" className="size-12 rounded-lg object-cover" /> : <div className="grid size-12 place-items-center rounded-lg bg-primary/10"><Trophy className="size-5 text-primary" /></div>}
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{nominee.name}</p>{nominee.bio && <p className="line-clamp-2 text-xs text-muted-foreground">{nominee.bio}</p>}</div>
                </div>
                {contest.countsVisible && <div className="mt-2"><div className="flex justify-between text-xs"><span>{nominee.votes ?? 0} votes</span><span>{pct}%</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: String(pct) + '%' }} /></div></div>}
                <Button className="mt-3 w-full" size="sm" variant={selected ? 'outline' : 'default'} disabled={busy || !contest.canVote || Boolean(category.myNomineeId)} onClick={() => void vote(contest, category, nominee)}>
                  {selected ? <><CheckCircle2 className="mr-1 size-4" /> Voted</> : <><Vote className="mr-1 size-4" /> Vote free</>}
                </Button>
              </div>
            })}</div>
          </div>)}
        </article>)}
        <p className="text-xs text-muted-foreground">One free vote per account per category. Paid voting is not yet available.</p>
      </CardContent>
    </Card>
    <Dialog open={editing} onOpenChange={setEditing}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto rounded-2xl">
        <DialogHeader><DialogTitle>{draftId ? 'Edit draft competition' : 'Create an award competition'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="award-title">Competition title</Label><Input id="award-title" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="e.g. Ghana Cultural Talent Awards" /></div>
          <div><Label htmlFor="award-description">Description</Label><Textarea id="award-description" maxLength={1200} value={description} onChange={e => setDescription(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="award-start">Voting starts</Label><Input type="datetime-local" id="award-start" value={starts} onChange={e => setStarts(e.target.value)} /></div>
            <div><Label htmlFor="award-end">Voting ends</Label><Input type="datetime-local" id="award-end" value={ends} onChange={e => setEnds(e.target.value)} /></div>
          </div>
          <div><Label htmlFor="award-results">Public results</Label>
            <select id="award-results" value={visibility} onChange={e => setVisibility(e.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm">
              <option value="AFTER_CLOSE">Reveal after close</option><option value="LIVE">Live totals</option><option value="HIDDEN">Organizer only</option>
            </select>
          </div>
          {draftCategories.map((category, index) => <div className="space-y-2 rounded-xl border p-3" key={index}>
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">Category {index + 1}</p>
              {draftCategories.length > 1 && <Button variant="outline" size="sm" onClick={() => setDraftCategories(old => old.filter((_, i) => i !== index))}>Remove</Button>}
            </div>
            <Input aria-label={'Category ' + (index + 1) + ' name'} maxLength={90} placeholder="Best Gospel Artist" value={category.title} onChange={e => setDraftCategories(old => old.map((c, i) => i === index ? { ...c, title: e.target.value } : c))} />
            <Label htmlFor={'award-nominees-' + index}>Nominees (2–24, one per line: Name | optional bio | optional HTTPS photo)</Label>
            <Textarea rows={4} id={'award-nominees-' + index} value={category.nominees} placeholder={'Nominee One | Singer and performer | https://example.com/photo.jpg\nNominee Two'} onChange={e => setDraftCategories(old => old.map((c, i) => i === index ? { ...c, nominees: e.target.value } : c))} />
          </div>)}
          <Button size="sm" variant="outline" disabled={draftCategories.length >= 12} onClick={() => setDraftCategories(old => [...old, blankCategory()])}><Plus className="mr-1 size-4" /> Add category</Button>
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Free voting only until payment settlement, refunds and vote audit certification are implemented.</p>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          <Button disabled={busy || !title.trim() || draftCategories.some(c => !c.title.trim() || c.nominees.split(/\r?\n/).filter(x => x.trim()).length < 2)} onClick={() => void create()}>{busy && <Loader2 className="mr-1 size-4 animate-spin" />} {draftId ? 'Save changes' : 'Save draft'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
}
