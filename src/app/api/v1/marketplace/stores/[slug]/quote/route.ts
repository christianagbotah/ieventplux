import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {errors,handle,jsonOk,readJson,rateLimit} from '@/server/api'
import {
  MarketplaceQuoteError,buildMarketplaceQuote,parseQuoteSelections,type QuoteSelection,
} from '@/server/marketplace-quote-policy'

type Context={params:Promise<{slug:string}>}

/** Read-only, price-authoritative basket validation. No orders, reservations,
 * payments or private seller details are exposed. Rate-limit is shared in DB.
 */
export async function POST(req:NextRequest,ctx:Context){
  return handle(async()=>{
    await rateLimit(req,'marketplace-basket-quote',30,60_000)
    const {slug}=await ctx.params
    let selections:QuoteSelection[]
    try{selections=parseQuoteSelections(await readJson<unknown>(req))}
    catch(error){if(error instanceof MarketplaceQuoteError)throw errors.badRequest(error.message);throw error}
    const store=await db.marketplaceStore.findUnique({
      where:{slug},select:{id:true,slug:true,status:true,deletedAt:true,currency:true},
    })
    if(!store||store.deletedAt||store.status!=='ACTIVE')throw errors.notFound('Store is unavailable.')
    const variants=await db.marketplaceVariant.findMany({
      where:{storeId:store.id,id:{in:selections.map(x=>x.variantId)},active:true,
        product:{status:'ACTIVE',deletedAt:null,productKind:'GOODS'}},
      select:{id:true,sku:true,title:true,priceMinor:true,currency:true,
        stockOnHand:true,stockReserved:true,
        product:{select:{id:true,name:true,status:true,productKind:true,deletedAt:true}}},
    })
    let quote
    try{quote=buildMarketplaceQuote(selections,variants,store.currency)}
    catch(error){if(error instanceof MarketplaceQuoteError)throw errors.conflict(error.message);throw error}
    const response=jsonOk({...quote,storeSlug:store.slug,quotedAt:new Date().toISOString()})
    response.headers.set('Cache-Control','private, no-store')
    return response
  })
}
