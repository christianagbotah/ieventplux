import { NextResponse } from 'next/server'
import { latestAndroidQaRelease, QA_RELEASE_REPO } from '@/server/android-qa-release-policy'

/**
 * Unauthenticated public update index for Android internal QA builds.
 * A successful tagged and asset-backed GitHub pre-release is required; GitHub
 * code pushes and uncompleted CI artifacts do not trigger in-app prompts.
 */
export async function GET() {
  try {
    const response = await fetch('https://api.github.com/repos/' + QA_RELEASE_REPO + '/releases?per_page=20', {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'iEventPlux-Android-Update-Checker',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(6500),
    })
    if (!response.ok) throw new Error('Release index unavailable')
    const release = latestAndroidQaRelease(await response.json())
    return NextResponse.json({
      channel: 'qa',
      platform: 'android',
      latest: release,
      automaticInstallation: false,
      googlePlayRelease: false,
    }, {
      headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=300' },
    })
  } catch {
    // Never fabricate an update, version or release download during outage.
    return NextResponse.json({
      channel: 'qa', platform: 'android', latest: null, temporarilyUnavailable: true,
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
