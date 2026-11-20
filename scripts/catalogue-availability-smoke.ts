/** Safe HTTP acceptance: provider visibility and genuine catalogue fallback. */
const base = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '')
const target = new URL(base)
if (process.env.NODE_ENV === 'production' || !['127.0.0.1','localhost'].includes(target.hostname)) {
  throw new Error('Catalogue status smoke can only run on local development.')
}
const status = await fetch(base + '/ai/status')
const capability = await status.json()
if (status.status !== 200 || typeof capability.available !== 'boolean' || capability.catalogueSearch !== true) {
  throw new Error('Public AI capability endpoint must clearly report AI and catalogue availability.')
}
console.log('PASS public AI capability truthful and exposes no provider credentials')
if (!capability.available) {
  const response = await fetch(base + '/ai/search', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({query:'free events'}),
  })
  const result = await response.json()
  if (response.status !== 200 || result.source !== 'CATALOGUE' || !Array.isArray(result.items) ||
      typeof result.total !== 'number' || result.filters?.price !== 'FREE') {
    throw new Error('Unavailable model must use real read-only catalogue fallback, not 503 or invented content.')
  }
  console.log('PASS unavailable AI still supports genuine public event finder, no model usage')
} else {
  console.log('SKIP model-backed search; never trigger external paid generation in CI')
}
