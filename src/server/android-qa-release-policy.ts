/**
 * Public GitHub prereleases are the SOURCE OF TRUTH for installable Android QA
 * builds. A GitHub commit or workflow status alone is NOT a published update.
 * Never return a download URL supplied by arbitrary metadata or another repo.
 */
export const QA_RELEASE_REPO = 'christianagbotah/ieventplux'
export const QA_ASSET_NAMES = ['app-release.apk', 'ieventplux-android-qa.apk'] as const
export type AndroidQaRelease = {
  revision: string
  tag: string
  publishedAt: string
  downloadUrl: string
  sizeBytes: number
  notes: string
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function latestAndroidQaRelease(input: unknown): AndroidQaRelease | null {
  if (!Array.isArray(input)) return null
  const releases: AndroidQaRelease[] = []
  for (const release of input.slice(0, 30)) {
    if (!isRecord(release) || release.draft !== false || release.prerelease !== true) continue
    const tag = release.tag_name
    if (typeof tag !== 'string' || !/^android-qa-[a-f0-9]{7,40}$/.test(tag)) continue
    const publishedAt = release.published_at
    if (typeof publishedAt !== 'string' || !Number.isFinite(Date.parse(publishedAt))) continue
    if (!Array.isArray(release.assets)) continue
    const asset = release.assets.find((item: unknown) => {
      if (!isRecord(item) || !QA_ASSET_NAMES.includes(item.name as (typeof QA_ASSET_NAMES)[number])) return false
      const url = item.browser_download_url
      return typeof url === 'string' &&
        url === 'https://github.com/' + QA_RELEASE_REPO + '/releases/download/' + tag + '/' + item.name &&
        typeof item.size === 'number' && Number.isSafeInteger(item.size) && item.size > 10_000_000
    })
    if (!isRecord(asset)) continue
    releases.push({
      tag,
      revision: tag.slice('android-qa-'.length),
      publishedAt,
      downloadUrl: asset.browser_download_url as string,
      sizeBytes: asset.size as number,
      notes: typeof release.body === 'string' ? release.body.slice(0, 500) : '',
    })
  }
  releases.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  return releases[0] ?? null
}
