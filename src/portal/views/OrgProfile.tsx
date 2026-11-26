'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldCheck, MapPin, Users, ChevronLeft, Bookmark, Globe, Mail, Phone, ExternalLink, Camera, Pencil, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { api, ApiClientError } from '../api'
import { useToast } from '@/hooks/use-toast'
import { navigate } from '../router'
import { EventCard, EventCardSkeleton, EmptyState, type EventCardData } from '../components/EventCard'
import { usePortal } from '../store'
import { OrganizerProfileEditor } from '../components/OrganizerProfileEditor'
import { SubmissionFeedback } from '@/components/ui/submission-feedback'
import { ORGANIZER_TYPE_CONFIG, organizerType, type ProfileDetails } from '@/lib/organization-types'

interface OrgProfilePayload {
  org: {
    id: string
    name: string
    slug: string
    tagline?: string | null
    description?: string | null
    logoUrl?: string | null
    coverUrl?: string | null
    orgType: string
    profileDetails?: ProfileDetails
    city?: string | null
    country: string
    website?: string | null
    contactEmail?: string | null
    contactPhone?: string | null
    address?: string | null
    mapsUrl?: string | null
    latitude?: number | null
    longitude?: number | null
    socialLinks?: Record<string, string>
    verifiedAt?: string | null
    verified: boolean
  }
  events: EventCardData[]
  followers: number
  following: boolean
  myOrg?: boolean
  canEdit?: boolean
  clips: { id: string; url: string; caption?: string | null }[]
}

export default function OrgProfile({ slug }: { slug: string }) {
  const { user, booted } = usePortal()
  if(!booted)return <div className="px-4 py-8"><div className="ievx-skeleton h-48 rounded-2xl" /></div>
  return <ProfileView key={slug+':'+(user?.id??'guest')} slug={slug}/>
}
function ProfileView({slug}:{slug:string}){
  const { user, setActiveOrg } = usePortal()
  const { toast } = useToast()
  const [data, setData] = useState<OrgProfilePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [following, setFollowing] = useState(false)
  const [followingBusy, setFollowingBusy] = useState(false)
  const [activeSection, setActiveSection] = useState('org-events')
  const [editorOpen,setEditorOpen]=useState(false)
  const [branding,setBranding]=useState<'logo'|'cover'|null>(null)
  const [brandError,setBrandError]=useState('')
  const [brandAttempt,setBrandAttempt]=useState(0)
  const logoInput=useRef<HTMLInputElement>(null)
  const coverInput=useRef<HTMLInputElement>(null)

  const load = useCallback(async (refresh=false) => {
    try {
      const payload = await api.get<OrgProfilePayload>(`/orgs/${slug}/profile`)
      setError(null)
      setData(payload)
      setFollowing(payload.following)
    } catch (err) {
      const message=err instanceof ApiClientError?err.message:'Organizer not found.'
      if(refresh)toast({title:'Profile saved, but refresh failed',description:'Reload the page to see your latest changes.',variant:'destructive'})
      else setError(message)
    }
  }, [slug,toast])

  useEffect(() => {
    void load()
  }, [load, user?.id])

  async function uploadBrand(file:File|undefined,purpose:'logo'|'cover'){
    if(!file||!data?.canEdit||branding||editorOpen)return
    setBranding(purpose);setBrandError('')
    try{
      const form=new FormData();form.append('file',file);form.append('purpose',purpose)
      const result=await api.upload<{url:string}>('/orgs/'+encodeURIComponent(data.org.id)+'/branding',form)
      setData(current=>current?{...current,org:{...current.org,[purpose==='logo'?'logoUrl':'coverUrl']:result.url}}:current)
      toast({title:purpose==='logo'?'Profile picture updated':'Profile banner updated'})
    }catch(e){const message=e instanceof Error?e.message:'Image upload failed.';setBrandError(message);setBrandAttempt(n=>n+1);toast({title:'Image not updated',description:message,variant:'destructive',duration:10000})}
    finally{setBranding(null)}
  }
  const toggleFollow = async () => {
    if (!user) return navigate('/signin')
    if (!data?.org.id || followingBusy || data.myOrg) return
    const wasFollowing = following
    setFollowingBusy(true)
    try {
      await api.post(wasFollowing ? '/social/unfollow' : '/social/follow', { orgId: data.org.id })
      setFollowing(!wasFollowing)
      setData((current) => current ? { ...current, followers: Math.max(0, current.followers + (wasFollowing ? -1 : 1)) } : current)
      toast({ title: wasFollowing ? 'Unfollowed organizer' : 'Following organizer',
        description: wasFollowing ? 'Their updates will no longer appear in your Following feed.' : 'Public events and announcements can now appear in your Following feed.' })
    } catch (err) {
      toast({ title: 'Unable to update following', variant: 'destructive',
        description: err instanceof ApiClientError ? err.message : 'Check your connection and try again.' })
    } finally {
      setFollowingBusy(false)
    }
  }

  if (error) {
    return <div className="mx-auto max-w-3xl px-4 py-16"><EmptyState title="Organizer unavailable" description={error} action={<Button className="rounded-full" onClick={() => navigate('/')}>Back</Button>} /></div>
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="ievx-skeleton h-48 rounded-2xl" />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => <EventCardSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  const upcoming = data.events.filter((e) => ['PUBLISHED', 'LIVE', 'POSTPONED'].includes(e.status ?? 'PUBLISHED'))
  const past = data.events.filter((e) => e.status === 'ENDED')
  const sections = [
    ...(data.clips.length > 0 ? [{ id: 'org-clips', label: 'Clips' }] : []),
    { id: 'org-events', label: 'Upcoming events' },
    ...(past.length > 0 ? [{ id: 'org-past', label: 'Past events' }] : []),
  ]

  return (
    <div className="px-4 pb-12 pt-4 sm:px-6 sm:pt-6">
      <div className="relative h-36 w-full overflow-hidden rounded-2xl sm:h-52">
        {data.org.coverUrl ? (
          <img src={data.org.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/25 via-accent/20 to-primary/10" />
        )}
        <Button variant="secondary" size="sm" className="absolute left-3 top-3 min-h-11" onClick={()=>navigate('/')}><ChevronLeft className="size-4"/>Discover</Button>
        {data.canEdit&&<><input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>{void uploadBrand(e.target.files?.[0],'cover');e.target.value=''}}/><Button variant="secondary" size="sm" className="absolute right-3 top-3 min-h-11" disabled={!!branding||editorOpen} onClick={()=>coverInput.current?.click()}>{branding==='cover'?<Loader2 className="size-4 animate-spin"/>:<Camera className="size-4"/>}Edit banner</Button></>}
      </div>

      <div className="px-1">
        <div className="flex flex-wrap items-start justify-between gap-3 pt-3">
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
            <div className="relative -mt-9 shrink-0">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-background bg-primary text-2xl font-extrabold text-primary-foreground shadow-lg">
              {data.org.logoUrl ? <img src={data.org.logoUrl} alt={data.org.name + ' logo'} className="h-full w-full object-contain bg-white" /> : data.org.name.slice(0, 2).toUpperCase()}
            </span>
            {data.canEdit&&<><input ref={logoInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>{void uploadBrand(e.target.files?.[0],'logo');e.target.value=''}}/><button type="button" className="absolute -bottom-1 -right-1 grid size-11 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow" aria-label="Edit profile picture" disabled={!!branding||editorOpen} onClick={()=>logoInput.current?.click()}>{branding==='logo'?<Loader2 className="size-4 animate-spin"/>:<Pencil className="size-4"/>}</button></>}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-xl font-bold sm:text-2xl">{data.org.name}</h1>
                {data.org.verified && <Badge className="gap-1 bg-primary text-primary-foreground"><ShieldCheck className="h-3 w-3" /> Verified</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.org.tagline ?? ORGANIZER_TYPE_CONFIG[organizerType(data.org.orgType) ?? 'ASSOCIATION'].shortLabel}
                {data.org.city && <> · <MapPin className="inline h-3.5 w-3.5" aria-hidden /> {data.org.city}</>}
                {' '}· <Users className="inline h-3.5 w-3.5" aria-hidden /> {data.followers.toLocaleString()} followers
              </p>
            </div>
          </div>
          {data.myOrg ? (
            <div className="flex flex-wrap gap-2">{data.canEdit&&<Button size="sm" className="min-h-11" disabled={!!branding} onClick={()=>setEditorOpen(true)}><Pencil className="size-4"/>Edit profile</Button>}
            <Button variant="outline" size="sm" className="min-h-11" onClick={() => {setActiveOrg(data.org.id);navigate('/organizer?tab=events')}}>Manage events</Button></div>
          ) : following ? (
            <Button className="rounded-full ievx-press" variant="outline" disabled={followingBusy} onClick={() => void toggleFollow()}>
              <Bookmark className="mr-1.5 h-4 w-4 fill-primary text-primary" aria-hidden />
              Following
            </Button>
          ) : (
            <button
              type="button"
              className="efx-shine-sweep-button"
              style={{ borderRadius: '999px', fontSize: '0.9rem', padding: '0.6rem 1.5rem' }}
              disabled={followingBusy}
              onClick={() => void toggleFollow()}
            >
              <Bookmark className="h-4 w-4" aria-hidden />
              Follow
            </button>
          )}
        </div>

        {data.canEdit&&<div className="mt-3 space-y-2"><SubmissionFeedback message={brandError} attempt={brandAttempt}/><p className="text-xs text-muted-foreground">Profile picture: 512 × 512 · Banner: 1600 × 600 · JPG, PNG or WebP, max 5 MB each. Public images.</p></div>}
        {editorOpen&&data.canEdit&&<OrganizerProfileEditor org={data.org} onClose={()=>setEditorOpen(false)} onSaved={()=>{setEditorOpen(false);void load(true)}}/>}
        {sections.length > 1 && (
          <nav
            className="efx-underline-slide-nav"
            aria-label="Organizer sections"
            style={{ maxWidth: '100%', margin: '1.5rem 0 0', justifyContent: 'flex-start', flexWrap: 'wrap', gap: '0.4rem 1.4rem', paddingBottom: '0.75rem' }}
          >
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`efx-underline-slide-nav__link${activeSection === s.id ? ' efx-underline-slide-nav__link--active' : ''}`}
                aria-current={activeSection === s.id ? 'true' : undefined}
                onClick={() => {
                  setActiveSection(s.id)
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                {s.label}
              </button>
            ))}
          </nav>
        )}

        {data.org.description && (
          <Card className="mt-6 rounded-2xl">
            <CardContent className="p-5 text-sm leading-relaxed text-foreground/90">{data.org.description}</CardContent>
          </Card>
        )}

        {organizerType(data.org.orgType) && data.org.profileDetails && Object.entries(data.org.profileDetails).some(([key, value]) => key !== 'registrationNumber' && Boolean(value)) && (
          <Card className="mt-4 rounded-2xl">
            <CardContent className="p-5">
              <h2 className="mb-3 text-sm font-semibold">{ORGANIZER_TYPE_CONFIG[organizerType(data.org.orgType)!].detailsTitle}</h2>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {ORGANIZER_TYPE_CONFIG[organizerType(data.org.orgType)!].fields
                  .filter((field) => field.key !== 'registrationNumber' && data.org.profileDetails?.[field.key])
                  .map((field) => (
                    <div key={field.key}>
                      <dt className="text-xs text-muted-foreground">{field.label}</dt>
                      <dd className="font-medium">{data.org.profileDetails?.[field.key]}</dd>
                    </div>
                  ))}
              </dl>
            </CardContent>
          </Card>
        )}

        {data.clips.length > 0 && (
          <section id="org-clips" className="mt-8 scroll-mt-24">
            <h2 className="mb-3 text-lg font-bold">Recent clips</h2>
            <div className="ievx-scrollbar flex gap-3 overflow-x-auto pb-2">
              {data.clips.map((c) => (
                <button key={c.id} className="group h-40 w-28 shrink-0 overflow-hidden rounded-xl" onClick={() => navigate('/reels')}>
                  { }
                  <img src={c.url} alt={c.caption ?? 'Clip'} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                  {c.caption && <p className="sr-only">{c.caption}</p>}
                </button>
              ))}
            </div>
          </section>
        )}

        <section id="org-events" className="mt-8 scroll-mt-24">
          <h2 className="mb-4 text-lg font-bold">Upcoming events ({upcoming.length})</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming events" description={`${data.org.name} has not announced their next gathering yet.`} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {upcoming.map((e, i) => <EventCard key={e.id} event={e} index={i} />)}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section id="org-past" className="mt-10 scroll-mt-24">
            <h2 className="mb-4 text-lg font-bold">Past events</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {past.slice(0, 4).map((e, i) => <EventCard key={e.id} event={e} index={i} />)}
            </div>
          </section>
        )}

        {(data.org.contactEmail || data.org.contactPhone || data.org.website || data.org.address || data.org.mapsUrl || data.org.latitude != null || Object.keys(data.org.socialLinks ?? {}).length > 0) && (
          <Card className="mt-8 rounded-xl">
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-bold">Contact, location & social media</h2>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {data.org.contactEmail && <a href={'mailto:' + data.org.contactEmail} className="inline-flex items-center gap-1.5 text-primary hover:underline"><Mail className="h-4 w-4" /> {data.org.contactEmail}</a>}
                {data.org.contactPhone && <a href={'tel:' + data.org.contactPhone} className="inline-flex items-center gap-1.5 text-primary hover:underline"><Phone className="h-4 w-4" /> {data.org.contactPhone}</a>}
                {data.org.website?.startsWith('https://') && <a href={data.org.website} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-1.5 text-primary hover:underline"><Globe className="h-4 w-4" /> Website <ExternalLink className="h-3 w-3" /></a>}
                {data.org.address && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {data.org.address}</span>}
                {(data.org.mapsUrl?.startsWith('https://') || (data.org.latitude != null && data.org.longitude != null)) && (
                  <a href={data.org.mapsUrl?.startsWith('https://') ? data.org.mapsUrl : 'https://www.google.com/maps/search/?api=1&query=' + data.org.latitude + ',' + data.org.longitude} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-1.5 text-primary hover:underline"><MapPin className="h-4 w-4" /> Open location in Google Maps <ExternalLink className="h-3 w-3" /></a>
                )}
              </div>
              {Object.entries(data.org.socialLinks ?? {}).filter(([, url]) => typeof url === 'string' && url.startsWith('https://')).length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  {Object.entries(data.org.socialLinks ?? {}).filter(([, url]) => typeof url === 'string' && url.startsWith('https://')).map(([platform, url]) => (
                    <a key={platform} href={url} target="_blank" rel="noopener noreferrer" className="rounded-full border px-3 py-1.5 text-xs font-medium capitalize text-primary hover:bg-secondary">{platform === 'x' ? 'X / Twitter' : platform} <ExternalLink className="ml-1 inline h-3 w-3" /></a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
