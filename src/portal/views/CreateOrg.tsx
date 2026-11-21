'use client'

import { useState } from 'react'
import { Church, Building2, Users, UserRound, GraduationCap, HandHeart } from 'lucide-react'
import { ORGANIZER_TYPE_CONFIG, type OrganizerType, type ProfileDetails } from '@/lib/organization-types'
import { OrganizerTypeDetails } from '../components/OrganizerTypeDetails'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldHelp, FieldLabel } from '@/components/ui/field'
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
    <div className="mx-auto max-w-4xl px-3 py-6 sm:px-6 sm:py-9">
      <header className="ievx-form-surface relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-primary/5" />
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-primary">Organizer onboarding</p>
        <h1 className="text-2xl font-extrabold tracking-[-0.035em] sm:text-3xl">Create your organizer profile</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Organize events as yourself, a church, school, business, ministry or association. Add only the information relevant to your organizer type.</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-3 py-1.5 text-primary">1 · Profile</span>
          <span>2 · Verification</span>
          <span>3 · Publish events</span>
        </div>
      </header>
      <form onSubmit={submit} className="mt-5 space-y-5">
        <fieldset className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          <legend className="px-1 pb-2 text-base font-bold tracking-tight">Who is organizing the events? <span aria-label="required" className="text-destructive">*</span></legend>
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
              className={'group flex min-h-[130px] min-w-0 flex-col rounded-2xl border p-4 text-left shadow-sm transition-[border-color,background-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/25 motion-reduce:transition-none ' + (orgType === type.value ? 'border-primary bg-primary/10 ring-2 ring-primary/20 shadow-md' : 'border-border bg-background hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/[0.03] hover:shadow-md')}
              aria-pressed={orgType === type.value}
            >
              <span className="mb-3 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><type.icon className="size-5" aria-hidden /></span>
              <p className="text-sm font-semibold">{ORGANIZER_TYPE_CONFIG[type.value].label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ORGANIZER_TYPE_CONFIG[type.value].description}</p>
            </button>
          ))}
        </fieldset>
        {orgType ? (
          <>
            <Field className="ievx-form-surface p-4 sm:p-5">
              <FieldLabel htmlFor="create-org-name">{ORGANIZER_TYPE_CONFIG[orgType].nameLabel} <span className="text-destructive">*</span></FieldLabel>
              <Input id="create-org-name" required minLength={3} maxLength={120}
                autoComplete={orgType === 'INDIVIDUAL' ? 'name' : 'organization'}
                value={name} onChange={(e) => setName(e.target.value)} placeholder={ORGANIZER_TYPE_CONFIG[orgType].namePlaceholder} />
              <FieldHelp>Use your official name as it should appear on published event pages.</FieldHelp>
            </Field>
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground">You can update profile details later. Verification is required before activating paid ticket sales.</p>
          <Button type="submit" variant="premium" size="lg" className="w-full sm:w-auto" loading={busy} disabled={!orgType}>
            {orgType === 'INDIVIDUAL' ? 'Create personal profile' : 'Create organizer profile'}
          </Button>
        </div>
      </form>
    </div>
  )
}
