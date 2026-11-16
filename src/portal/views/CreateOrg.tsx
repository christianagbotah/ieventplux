'use client'

import { useState } from 'react'
import { Church, Building2, Users, UserRound, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'
import { OrganizationIdentityFields, emptyOrgFields } from '../components/OrganizationIdentityFields'

const ORG_TYPES = [
  { value: 'CHURCH', label: 'Church / Congregation', icon: Church, desc: 'Services, series and ministry events' },
  { value: 'MINISTRY', label: 'Ministry / Association', icon: Users, desc: 'Leadership, outreach and training' },
  { value: 'COMPANY', label: 'Company / Events business', icon: Building2, desc: 'Concerts, festivals and expos' },
  { value: 'INDIVIDUAL', label: 'Individual organizer', icon: UserRound, desc: 'Personal events and workshops' },
]

export default function CreateOrg() {
  const { toast } = useToast()
  const { user, setMemberships, booted } = usePortal()
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [orgType, setOrgType] = useState('CHURCH')
  const [details, setDetails] = useState(emptyOrgFields)
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    let orgCreated = false
    try {
      const result = await api.post<{ org: { id: string; name: string } }>('/orgs', { name, orgType, ...details })
      orgCreated = true
      if (logoFile) {
        const data = new FormData()
        data.append('file', logoFile)
        try {
          await api.upload('/orgs/' + result.org.id + '/logo', data)
        } catch (error) {
          toast({ title: 'Organization created; logo not uploaded', description: error instanceof ApiClientError ? error.message : 'You can add it under Settings.', variant: 'destructive' })
        }
      }
      const me = await api.get<{ memberships: Parameters<typeof setMemberships>[0] }>('/auth/me')
      setMemberships(me.memberships ?? [])
      toast({ title: result.org.name + ' created', description: 'Complete private document verification in Settings before paid ticket sales.' })
      navigate('/organizer?tab=settings')
    } catch (err) {
      toast({ title: orgCreated ? 'Organization created — open Settings to finish' : 'Could not create organization', description: err instanceof ApiClientError ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  if (!booted) return null
  if (!user) {
    navigate('/signin')
    return null
  }
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <h1 className="text-xl font-extrabold sm:text-2xl">Create your organization</h1>
      <p className="mt-1 text-sm text-muted-foreground">Create a public organizer profile with contact details, a map location, social profiles and a logo.</p>
      <form onSubmit={submit} className="mt-5 space-y-5">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-semibold">Organization type</legend>
          {ORG_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setOrgType(type.value)}
              className={'rounded-xl border p-3 text-left transition-colors ' + (orgType === type.value ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/50')}
              aria-pressed={orgType === type.value}
            >
              <type.icon className="mb-1.5 h-5 w-5 text-primary" aria-hidden />
              <p className="text-sm font-semibold">{type.label}</p>
              <p className="text-xs text-muted-foreground">{type.desc}</p>
            </button>
          ))}
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="create-org-name">Organization name *</Label>
          <Input id="create-org-name" required minLength={3} maxLength={120} autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} placeholder="Official organization name" />
        </div>
        <OrganizationIdentityFields value={details} onChange={setDetails} logoFile={logoFile} onLogoFile={setLogoFile} />
        <div className="rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
          Next: upload business registration, a government ID and a selfie under <strong>Settings → Verification</strong>. Identity is reviewed manually; live payments remain subject to provider activation.
        </div>
        <button type="submit" className="efx-neon-pulse-button w-full" disabled={busy} style={busy ? { opacity: 0.6, cursor: 'not-allowed' } : {}}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Create organization
        </button>
      </form>
    </div>
  )
}
