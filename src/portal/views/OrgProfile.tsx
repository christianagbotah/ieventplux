'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, MapPin, Users, ChevronLeft, Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { EventCard, EventCardSkeleton, EmptyState, type EventCardData } from '../components/EventCard'
import { usePortal } from '../store'
import { relative } from '../format'

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
    city?: string | null
    country: string
    website?: string | null
    contactEmail?: string | null
    verifiedAt?: string | null
    verified: boolean
  }
  events: EventCardData[]
  followers: number
  following: boolean
  clips: { id: string; url: string; caption?: string | null }[]
}

export default function OrgProfile({ slug }: { slug: string }) {
  const { user } = usePortal()
  const [data, setData] = useState<OrgProfilePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [following, setFollowing] = useState(false)

  const load = useCallback(async () => {
    try {
      const payload = await api.get<OrgProfilePayload>(`/orgs/${slug}/profile`)
      setData(payload)
      setFollowing(payload.following)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Organizer not found.')
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load, user?.id])

  const toggleFollow = async () => {
    if (!user) return navigate('/signin')
    try {
      await api.post('/social/follow', { orgId: data?.org.id })
      setFollowing((f) => !f)
      setData((d) => (d ? { ...d, followers: d.followers + (following ? -1 : 1) } : d))
    } catch {
      /* ignore */
    }
  }

  if (error) {
    return <div className="mx-auto max-w-3xl px-4 py-16"><EmptyState title="Organizer unavailable" description={error} action={<Button className="rounded-full" onClick={() => navigate('/')}>Back</Button>} /></div>
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="ievx-skeleton h-48 rounded-2xl" />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <EventCardSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  const upcoming = data.events.filter((e) => ['PUBLISHED', 'LIVE', 'POSTPONED'].includes(e.status ?? 'PUBLISHED'))
  const past = data.events.filter((e) => e.status === 'ENDED')

  return (
    <div>
      <div className="relative h-52 w-full overflow-hidden sm:h-64">
        {data.org.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.org.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/25 via-accent/20 to-primary/10" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="mx-auto -mt-14 max-w-7xl px-4">
        <Button variant="ghost" size="sm" className="mb-3 -ml-2 rounded-full text-muted-foreground" onClick={() => navigate('/')}>
          <ChevronLeft className="h-4 w-4" /> Discover
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-background bg-primary text-2xl font-extrabold text-primary-foreground shadow-lg">
              {data.org.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold sm:text-3xl">{data.org.name}</h1>
                {data.org.verified && <Badge className="gap-1 bg-primary text-primary-foreground"><ShieldCheck className="h-3 w-3" /> Verified</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.org.tagline ?? data.org.orgType.toLowerCase()}
                {data.org.city && <> · <MapPin className="inline h-3.5 w-3.5" aria-hidden /> {data.org.city}</>}
                {' '}· <Users className="inline h-3.5 w-3.5" aria-hidden /> {data.followers.toLocaleString()} followers
              </p>
            </div>
          </div>
          <Button className="rounded-full ievx-press" variant={following ? 'outline' : 'default'} onClick={() => void toggleFollow()}>
            <Bookmark className={`mr-1.5 h-4 w-4 ${following ? 'fill-primary text-primary' : ''}`} />
            {following ? 'Following' : 'Follow'}
          </Button>
        </div>

        {data.org.description && (
          <Card className="mt-6 rounded-2xl">
            <CardContent className="p-5 text-sm leading-relaxed text-foreground/90">{data.org.description}</CardContent>
          </Card>
        )}

        {data.clips.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-bold">Recent clips</h2>
            <div className="ievx-scrollbar flex gap-3 overflow-x-auto pb-2">
              {data.clips.map((c) => (
                <button key={c.id} className="group h-40 w-28 shrink-0 overflow-hidden rounded-xl" onClick={() => navigate('/reels')}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt={c.caption ?? 'Clip'} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                  {c.caption && <p className="sr-only">{c.caption}</p>}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
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
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-bold">Past events</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {past.slice(0, 4).map((e, i) => <EventCard key={e.id} event={e} index={i} />)}
            </div>
          </section>
        )}

        {data.org.contactEmail && (
          <p className="mt-10 text-xs text-muted-foreground">Support contact: {data.org.contactEmail}{data.org.website ? ` · ${data.org.website}` : ''}</p>
        )}
      </div>
    </div>
  )
}
