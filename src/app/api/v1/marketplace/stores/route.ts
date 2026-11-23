import { NextRequest } from 'next/server'
import { handle, jsonOk, requireUser, errors, readJson, rateLimit } from '@/server/api'
import { getSession } from '@/server/auth'
import { MarketplacePolicyError } from '@/server/marketplace-policy'
import { createStore, listStores } from '@/server/services/marketplace'

export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession()
    const mine = req.nextUrl.searchParams.get('mine') === '1'
    const search = req.nextUrl.searchParams.get('q') ?? ''
    if (mine && !session) throw errors.unauthorized()
    return jsonOk({
      stores: await listStores(session?.user.id ?? null, mine, search),
      checkoutEnabled: false,
    })
  })
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser()
    await rateLimit(req, 'marketplace-store-create', 8, 60_000)
    const raw = await readJson<unknown>(req)
    try {
      const store = await createStore(user.id, raw)
      return jsonOk({store},{status:201})
    } catch(e) {
      if(e instanceof MarketplacePolicyError) throw errors.badRequest(e.message)
      throw e
    }
  })
}
