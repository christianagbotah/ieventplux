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
