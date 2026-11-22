import { notFound, redirect } from 'next/navigation'
import { legacyHashLocation } from '@/server/legacy-hash-route'

type Props = {
  params: Promise<{ legacy: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Existing iEventPlux links are /#/event/... and /#/meeting/....
 * A direct /event/... or /meeting/... request should reach the same screen
 * instead of a Next.js 404. Auth/access control remains in the actual view/API.
 */
export default async function LegacyPortalLink({ params, searchParams }: Props) {
  const { legacy } = await params
  const target = legacyHashLocation(legacy, await searchParams)
  if (!target) notFound()
  redirect(target)
}
