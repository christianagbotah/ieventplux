import { NextResponse } from 'next/server'
import { latestAndroidQaRelease, QA_RELEASE_REPO, type AndroidQaRelease } from '@/server/android-qa-release-policy'

// Releases must not be frozen in a Next.js build or persistent data cache.
// A short per-worker coalesced cache keeps the public GitHub API within its
// unauthenticated rate limit while allowing new Android QA versions to appear.
export const dynamic = 'force-dynamic'
export const revalidate = 0
const UPDATE_TTL_MS = 120_000
let cached: { release: AndroidQaRelease | null; until: number } | null = null
let inFlight: Promise<AndroidQaRelease | null> | null = null

async function readPublishedRelease(): Promise<AndroidQaRelease | null> {
  const now = Date.now()
  if (cached && now < cached.until) return cached.release
  if (!inFlight) {
    inFlight = (async () => {
      const response = await fetch('https://api.github.com/repos/' + QA_RELEASE_REPO + '/releases?per_page=20', {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'iEventPlux-Android-Update-Checker',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(6500),
      })
      if (!response.ok) throw new Error('Release index unavailable')
      const release = latestAndroidQaRelease(await response.json())
      cached = { release, until: Date.now() + UPDATE_TTL_MS }
      return release
    })().finally(() => { inFlight = null })
  }
  return inFlight
}

/**
 * Unauthenticated public update index for Android internal QA builds.
 * A tagged, asset-backed GitHub release is required; a code push is not enough.
 * No APK is fetched on the device without the user's explicit approval.
 */
export async function GET() {
  try {
    const release = await readPublishedRelease()
    return NextResponse.json({
      channel: 'qa', platform: 'android', latest: release,
      automaticInstallation: false, googlePlayRelease: false,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch {
    // Never advertise an invented version or stale replacement on fetch errors.
    return NextResponse.json({
      channel: 'qa', platform: 'android', latest: null, temporarilyUnavailable: true,
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
