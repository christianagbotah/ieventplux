import { expect, test } from 'bun:test'
import { GET } from './route'

test('Android update index refreshes verified release metadata without Next data caching', async () => {
  const original = globalThis.fetch
  let requests = 0
  globalThis.fetch = (async (_input: RequestInfo | URL, options?: RequestInit) => {
    requests++
    expect(options?.cache).toBe('no-store')
    return new Response(JSON.stringify([
      {draft:false,prerelease:true,tag_name:'android-qa-f42b307',published_at:'2026-11-24T02:12:00Z',
        assets:[{name:'app-release.apk',size:134375000,browser_download_url:'https://github.com/christianagbotah/ieventplux/releases/download/android-qa-f42b307/app-release.apk'}]},
      {draft:false,prerelease:true,tag_name:'android-qa-abc222a',published_at:'2026-11-24T01:00:00Z',
        assets:[{name:'app-release.apk',size:134355000,browser_download_url:'https://github.com/christianagbotah/ieventplux/releases/download/android-qa-abc222a/app-release.apk'}]},
    ]),{status:200,headers:{'Content-Type':'application/json'}})
  }) as typeof globalThis.fetch
  try {
    const [a,b] = await Promise.all([GET(),GET()])
    expect(a.status).toBe(200)
    expect(a.headers.get('Cache-Control')).toContain('no-store')
    expect((await a.json()).latest.tag).toBe('android-qa-f42b307')
    expect((await b.json()).latest.revision).toBe('f42b307')
    expect(requests).toBe(1)
  } finally { globalThis.fetch = original }
})
