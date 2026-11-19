'use client'

import { useState } from 'react'
import { Church, Building2, Users, UserRound, Loader2, GraduationCap, HandHeart } from 'lucide-react'
import { ORGANIZER_TYPE_CONFIG, type OrganizerType, type ProfileDetails } from '@/lib/organization-types'
import { OrganizerTypeDetails } from '../components/OrganizerTypeDetails'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'
import { OrganizationIdentityFields, emptyOrgFields } from '../components/OrganizationIdentityFields'

const ORG_TYPES: { value: OrganizerType; icon: typeof UserRound }[] = [
  { value: 'INDIVIDUAL', icon: UserRound },
  { value: 'CHURCH', icon: Church },
  { value: 'SCHOOL', icon: GraduationCap },
  { value: 'COMPANY', icon: Building2 },
  { value: 'MINISTRY', icon: HandHeart },
  { value: 'ASSOCIATION', icon: Users },
]

export default function CreateOrg() {
  const { toast } = useToast()
  const { user, setMemberships, booted } = usePortal()
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [orgType, setOrgType] = useState<OrganizerType | null>(null)
  const [profileDetails, setProfileDetails] = useState<ProfileDetails>({})
  const [details, setDetails] = useState(emptyOrgFields)
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!orgType) {
      toast({ title: 'Choose an organizer type', description: 'Select Personal, Church, School, Business, Ministry or Association to continue.', variant: 'destructive' })
      return
    }
    setBusy(true)
    let orgCreated = false
    try {
      const result = await api.post<{ org: { id: string; name: string } }>('/orgs', { name, orgType, profileDetails, ...details })
      orgCreated = true
      if (logoFile) {
        const data = new FormData()
        data.append('file', logoFile)
        try {
          await api.upload('/orgs/' + result.org.id + '/logo', data)
        } catch (error) {
          toast({ title: 'Organizer profile created; image not uploaded', description: error instanceof ApiClientError ? error.message : 'You can add it under Settings.', variant: 'destructive' })
        }
      }
      const me = await api.get<{ memberships: Parameters<typeof setMemberships>[0] }>('/auth/me')
      setMemberships(me.memberships ?? [])
      toast({ title: result.org.name + ' created', description: 'Your organizer profile is ready. Complete the identity checks shown in Settings before paid ticket sales.' })
      navigate('/organizer?tab=settings')
    } catch (err) {
      toast({ title: orgCreated ? 'Organizer created — open Settings to finish' : 'Could not create organizer profile', description: err instanceof ApiClientError ? err.message : 'Please try again.', variant: 'destructive' })
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
      <h1 className="text-xl font-extrabold sm:text-2xl">Create an organizer profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">Organize events as yourself, a church, school, business, ministry or association. Each type has its own relevant details.</p>
      <form onSubmit={submit} className="mt-5 space-y-5">
        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="mb-2 font-semibold">Who is organizing the events? *</legend>
          {ORG_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => {
                if (orgType === type.value) return
                if (type.value === 'INDIVIDUAL' && !name.trim()) setName(user.displayName ?? '')
                else if (orgType === 'INDIVIDUAL' && name === user.displayName) setName('')
                setOrgType(type.value)
                if (type.value === 'INDIVIDUAL') setDetails((previous) => ({ ...previous, address: '', mapsUrl: '', latitude: '', longitude: '' }))
              }}
              className={'min-h-[110px] cursor-pointer rounded-xl border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ' + (orgType === type.value ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-card hover:border-primary/50')}
              aria-pressed={orgType === type.value}
            >
              <type.icon className="mb-1.5 h-5 w-5 text-primary" aria-hidden />
              <p className="text-sm font-semibold">{ORGANIZER_TYPE_CONFIG[type.value].label}</p>
              <p className="text-xs text-muted-foreground">{ORGANIZER_TYPE_CONFIG[type.value].description}</p>
            </button>
          ))}
        </fieldset>
        {orgType ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="create-org-name">{ORGANIZER_TYPE_CONFIG[orgType].nameLabel} *</Label>
              <Input id="create-org-name" required minLength={3} maxLength={120}
                autoComplete={orgType === 'INDIVIDUAL' ? 'name' : 'organization'}
                value={name} onChange={(e) => setName(e.target.value)} placeholder={ORGANIZER_TYPE_CONFIG[orgType].namePlaceholder} />
            </div>
            <OrganizerTypeDetails type={orgType} value={profileDetails} onChange={setProfileDetails} />
            <OrganizationIdentityFields value={details} onChange={setDetails} logoFile={logoFile} onLogoFile={setLogoFile} orgType={orgType} />
            <div className="rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
              {orgType === 'INDIVIDUAL'
                ? 'Next: verify your identity with the front and back of your government ID and a selfie in Settings → Verification. You do not need company registration documents.'
                : 'Next: complete the relevant identity and institution-document checks in Settings → Verification. Paid ticket sales require manual review and provider activation.'}
            </div>
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground" role="status">
            Select an organizer type above to see its relevant fields.
          </p>
        )}
        <button type="submit" className="efx-neon-pulse-button w-full" disabled={busy || !orgType} style={busy ? { opacity: 0.6, cursor: 'not-allowed' } : {}}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {orgType === 'INDIVIDUAL' ? 'Create personal organizer profile' : 'Create organizer profile'}
        </button>
      </form>
    </div>
  )
}
