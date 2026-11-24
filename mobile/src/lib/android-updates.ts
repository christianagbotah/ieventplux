/**
 * Pure Android QA update comparison — no Expo/React Native dependencies.
 * Use only official GitHub release assets; a code push is not an APK update.
 */
export type QaAndroidRelease = {
  tag: string
  revision: string
  downloadUrl: string
  publishedAt: string
  notes: string
  sizeBytes: number
}
export type QaAndroidReleaseResponse = {
  channel: string
  platform: string
  latest: QaAndroidRelease | null
}
const REPO = 'https://github.com/christianagbotah/ieventplux/releases/download/'
export function validQaAndroidRelease(x: unknown): x is QaAndroidRelease {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false
  const r = x as Record<string, unknown>
  if (typeof r.revision !== 'string' || !/^[0-9a-f]{7,40}$/.test(r.revision)) return false
  if (r.tag !== 'android-qa-' + r.revision) return false
  if (typeof r.publishedAt !== 'string' || !Number.isFinite(Date.parse(r.publishedAt))) return false
  return typeof r.downloadUrl === 'string' &&
    (r.downloadUrl === REPO + r.tag + '/app-release.apk' ||
     r.downloadUrl === REPO + r.tag + '/ieventplux-android-qa.apk') &&
    typeof r.sizeBytes === 'number' && r.sizeBytes >= 10_000_000 &&
    typeof r.notes === 'string'
}

export function shouldOfferAndroidUpdate(args: {
  release: unknown; installedRevision: string | null; installedBuiltAt: string | null
}): args is { release: QaAndroidRelease; installedRevision: string | null; installedBuiltAt: string | null } {
  if (!validQaAndroidRelease(args.release)) return false
  const remote = args.release.revision
  const local = args.installedRevision
  if (local && (local.startsWith(remote) || remote.startsWith(local))) return false
  // Prevent older QA release from downgrading a newer but unpublished build.
  if (args.installedBuiltAt) {
    const builtAt = Date.parse(args.installedBuiltAt)
    if (Number.isFinite(builtAt) && Date.parse(args.release.publishedAt) <= builtAt) return false
  }
  return true
}

/** Independent public-source fallback while the web update endpoint is on an
 * older deployment. Trust only official prereleases with real APK assets. */
export function latestQaAndroidFromGithub(input: unknown): QaAndroidRelease | null {
  if (!Array.isArray(input)) return null
  const releases: QaAndroidRelease[] = []
  for (const entry of input.slice(0,30)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const r=entry as Record<string,unknown>
    if (r.draft!==false || r.prerelease!==true || typeof r.tag_name!=='string' ||
      !/^android-qa-[a-f0-9]{7,40}$/.test(r.tag_name) || !Array.isArray(r.assets)) continue
    const tag=r.tag_name
    for (const asset of r.assets) {
      if(!asset||typeof asset!=='object'||Array.isArray(asset))continue
      const a=asset as Record<string,unknown>
      if(a.name!=='app-release.apk' && a.name!=='ieventplux-android-qa.apk')continue
      const release={
        tag,revision:tag.slice('android-qa-'.length),
        downloadUrl:a.browser_download_url,
        publishedAt:r.published_at,
        sizeBytes:a.size,
        notes:typeof r.body==='string'?r.body.slice(0,500):'',
      }
      if(validQaAndroidRelease(release))releases.push(release)
    }
  }
  releases.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))
  return releases[0]??null
}

export function newestVerifiedQaAndroidRelease(web: unknown, github: unknown):QaAndroidRelease|null {
  const first=validQaAndroidRelease(web)?web:null
  const second=validQaAndroidRelease(github)?github:null
  if(!first)return second
  if(!second)return first
  return Date.parse(second.publishedAt)>Date.parse(first.publishedAt)?second:first
}
