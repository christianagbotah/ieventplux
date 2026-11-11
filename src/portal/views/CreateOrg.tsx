'use client'

import { useState } from 'react'
import { Church, Building2, Users, UserRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'

const ORG_TYPES = [
  { value: 'CHURCH', label: 'Church / Congregation', icon: Church, desc: 'Services, series and ministry events' },
  { value: 'MINISTRY', label: 'Ministry / Association', icon: Users, desc: 'Leadership, outreach and training' },
  { value: 'COMPANY', label: 'Company / Events business', icon: Building2, desc: 'Concerts, festivals and expos' },
  { value: 'INDIVIDUAL', label: 'Individual organizer', icon: UserRound, desc: 'Personal events and workshops' },
]

export default function CreateOrg() {
  const { toast } = useToast()
  const { user, setMemberships } = usePortal()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', orgType: 'CHURCH', tagline: '', description: '', city: '', contactPhone: '' })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const result = await api.post<{ org: { id: string; name: string } }>('/orgs', form)
      const me = await api.get<{ memberships: Parameters<typeof setMemberships>[0] }>('/auth/me')
      setMemberships(me.memberships ?? [])
      toast({ title: `${result.org.name} created`, description: 'Verification is required before paid ticket sales — submit documents from the workspace.' })
      navigate('/organizer')
    } catch (err) {
      toast({ title: 'Could not create the organization', description: err instanceof ApiClientError ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  if (!user) {
    navigate('/signin')
    return null
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-extrabold">Start organizing on iEventPlux</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        One account can attend events and organize. Create your organizer profile — churches, ministries, associations and companies welcome.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {ORG_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setForm((f) => ({ ...f, orgType: t.value }))}
              className={`rounded-2xl border p-4 text-left transition-all ievx-press ${form.orgType === t.value ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card hover:border-primary/40'}`}
              aria-pressed={form.orgType === t.value}
            >
              <t.icon className={`h-6 w-6 ${form.orgType === t.value ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden />
              <p className="mt-2 font-semibold">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Organization name</Label>
          <Input id="name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Lightworld Chapel International" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tagline">Tagline</Label>
            <Input id="tagline" value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} placeholder="Raising a generation of light." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Accra" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">About</Label>
          <Textarea id="description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Tell attendees who you are…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contactPhone">Public contact phone</Label>
          <Input id="contactPhone" value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} placeholder="+233 …" inputMode="tel" />
        </div>

        <div className="rounded-xl bg-secondary/60 p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">What happens next?</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
            <li>Create your first event (free RSVP works immediately).</li>
            <li>Submit verification documents to unlock paid ticket sales.</li>
            <li>Once verified, tickets sell with mobile-money checkout and payouts settle to your number.</li>
          </ol>
        </div>

        <Button type="submit" className="w-full rounded-xl py-5 ievx-press" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Create organization
        </Button>
      </form>
    </div>
  )
}
