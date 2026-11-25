import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { errors } from '@/server/api'
import {
  availableStock, parseProductDraft, parseStockAdjustment, parseStoreDraft,
  stockChangeAllowed, parseVariantPriceChange,
} from '@/server/marketplace-policy'
import { audit } from '@/server/audit'

function safeJson(raw: string, fallback: unknown) {
  try { return JSON.parse(raw) as unknown } catch { return fallback }
}
function uniqueConflict(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && error.code === 'P2002'
}
function serialConflict(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && error.code === 'P2034'
}
export async function ownedStore(idOrSlug: string, userId: string) {
  const store = await db.marketplaceStore.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], deletedAt: null },
  })
  if (!store) throw errors.notFound('Store not found.')
  if (store.ownerId !== userId) throw errors.forbidden('Only this store owner can manage its catalogue.')
  return store
}
export async function listStores(viewerId: string | null, mine: boolean, search = '', limit = 16) {
  if (mine && !viewerId) throw errors.unauthorized()
  const normalized = search.trim().slice(0, 90)
  const list = await db.marketplaceStore.findMany({
    where: {
      ...(mine ? { ownerId: viewerId! } : { status: 'ACTIVE' }),
      deletedAt: null,
      ...(normalized ? { OR: [
        { name: { contains: normalized, mode: 'insensitive' as const } },
        { category: { contains: normalized, mode: 'insensitive' as const } },
        { tagline: { contains: normalized, mode: 'insensitive' as const } },
      ] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: Math.min(Math.max(limit, 1), 30),
    select: {
      id:true, slug:true, name:true, tagline:true, category:true,
      logoUrl:true, coverUrl:true, country:true, city:true, status:true,
      verificationState:true, createdAt:true,
      _count:{ select:{ products:true } },
    },
  })
  return list.map(store => ({
    ...store, createdAt: store.createdAt.toISOString(),
    productCount: store._count.products,
    _count:undefined,
  }))
}
export async function getStoreCatalogue(slug: string, viewerId: string | null) {
  const store = await db.marketplaceStore.findUnique({
    where: { slug, deletedAt: null },
    include: {
      products: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: { variants: { orderBy:{ createdAt:'asc' } } },
      },
    },
  })
  if (!store) throw errors.notFound('Store not found.')
  const owner = viewerId === store.ownerId
  if (!owner && store.status !== 'ACTIVE') throw errors.notFound('Store not found.')
  return {
    store: {
      id:store.id, slug:store.slug, name:store.name, category:store.category,
      tagline:store.tagline, description:store.description,
      country:store.country, region:store.region, city:store.city, website:store.website,
      ...(owner?{pickupAddress:store.pickupAddress}:{}),
      logoUrl:store.logoUrl, coverUrl:store.coverUrl,
      status:store.status, currency:store.currency,
      verificationState:store.verificationState,
    },
    canManage: owner,
    checkoutEnabled: false,
    products: store.products.filter(product => owner || product.status === 'ACTIVE').map(product => ({
      id:product.id, slug:product.slug, name:product.name,
      shortDesc:product.shortDesc, description:product.description,
      brand:product.brand, category:product.category, productKind:product.productKind,
      specifications:safeJson(product.specifications,{}),
      images:safeJson(product.images,[]),
      status:product.status,
      variants:product.variants.filter(v => owner || v.active).map(v => ({
        id:v.id, sku:v.sku, title:v.title,
        options:safeJson(v.optionValues,{}),
        priceMinor:v.priceMinor, currency:v.currency,
        available:availableStock(v.stockOnHand,v.stockReserved),
        ...(owner ? { stockOnHand:v.stockOnHand, reserved:v.stockReserved, sold:v.stockSold } : {}),
        active:v.active,
      })),
    })),
  }
}
export async function createStore(userId: string, raw: unknown) {
  const body = parseStoreDraft(raw)
  const existing = await db.marketplaceStore.count({
    where: { ownerId: userId, deletedAt: null },
  })
  if (existing >= 8) throw errors.conflict('An account can manage up to eight stores.')
  try {
    const store = await db.marketplaceStore.create({ data:{
      ...body, ownerId:userId, currency:'GHS',
      status:'DRAFT', verificationState:'UNVERIFIED',
    }, select:{ id:true, slug:true, status:true, name:true } })
    await audit({ actorUserId:userId, actorLabel:'store-owner', action:'marketplace.store.create',
      entityType:'MarketplaceStore', entityId:store.id })
    return store
  } catch (error) {
    if (uniqueConflict(error)) throw errors.conflict('This store address is already in use.')
    throw error
  }
}
export async function updateStore(idOrSlug: string, userId: string, raw: unknown) {
  const existing = await ownedStore(idOrSlug,userId)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw errors.badRequest('Store changes are required.')
  const x=raw as Record<string,unknown>
  if (x.status !== undefined && x.status !== 'ACTIVE' && x.status !== 'DRAFT')
    throw errors.badRequest('Invalid store publication status.')
  if (x.status === 'ACTIVE') {
    const account = await db.user.findUnique({ where:{ id:userId },
      select:{emailVerifiedAt:true,status:true} })
    if (!account?.emailVerifiedAt || account.status !== 'ACTIVE')
      throw errors.forbidden('Verify your email address before publishing a public store.')
  }
  const update = parseStoreDraft({ ...existing, ...x })
  if (update.slug !== existing.slug) throw errors.badRequest('Store address cannot be changed after creation.')
  if (existing.status === 'SUSPENDED') throw errors.forbidden('Suspended stores require platform review.')
  const store=await db.marketplaceStore.update({
    where:{id:existing.id}, data:{...update,...(x.status ? {status:x.status as string}:{})},
    select:{id:true,slug:true,status:true},
  })
  await audit({actorUserId:userId,actorLabel:'store-owner',action:'marketplace.store.update',
    entityType:'MarketplaceStore',entityId:store.id})
  return store
}
export async function createProduct(storeSlug: string,userId: string,raw: unknown) {
  const store=await ownedStore(storeSlug,userId)
  const input=parseProductDraft(raw)
  try {
    const product=await db.marketplaceProduct.create({
      data:{
        storeId:store.id,name:input.name,slug:input.slug,shortDesc:input.shortDesc,
        description:input.description,brand:input.brand,category:input.category,
        productKind:input.productKind,specifications:input.specifications,
        images:input.images,status:'DRAFT',
        variants:{create:input.variants.map(v=>({
          storeId:store.id,...v,currency:'GHS',
          stockOnHand:0,stockReserved:0,stockSold:0,
        }))},
      },select:{id:true,slug:true,status:true,name:true},
    })
    await audit({actorUserId:userId,actorLabel:'store-owner',action:'marketplace.product.create',
      entityType:'MarketplaceProduct',entityId:product.id})
    return product
  } catch(error){
    if(uniqueConflict(error))throw errors.conflict('Product address or SKU already exists in this store.')
    throw error
  }
}
export async function setProductPublication(productId:string,userId:string,status:'ACTIVE'|'ARCHIVED'|'DRAFT'){
  const product=await db.marketplaceProduct.findUnique({
    where:{id:productId},include:{store:true,variants:{select:{id:true,priceMinor:true}}},
  })
  if(!product||product.deletedAt)throw errors.notFound('Product not found.')
  if(product.store.ownerId!==userId)throw errors.forbidden('Seller permission required.')
  if(product.store.status==='SUSPENDED')throw errors.forbidden('Store is suspended.')
  if(status==='ACTIVE' && (product.store.status!=='ACTIVE'||!product.variants.length))
    throw errors.conflict('Publish the store and add a valid product variant first.')
  if(status==='DRAFT' && product.status==='ARCHIVED')
    throw errors.conflict('Archived products cannot be silently reactivated.')
  const result=await db.marketplaceProduct.update({
    where:{id:product.id},data:{status},select:{id:true,status:true},
  })
  await audit({actorUserId:userId,actorLabel:'store-owner',action:'marketplace.product.publish',
    entityType:'MarketplaceProduct',entityId:product.id,after:{status}})
  return result
}
export async function adjustVariantStock(id:string,userId:string,raw:unknown) {
  const input=parseStockAdjustment(raw)
  try {
    const result=await db.$transaction(async tx=>{
      const variant=await tx.marketplaceVariant.findUnique({
        where:{id},include:{store:{select:{ownerId:true,status:true}},
          product:{select:{productKind:true,status:true}}},
      })
      if(!variant)throw errors.notFound('Product variant not found.')
      if(variant.store.ownerId!==userId)throw errors.forbidden('Seller permission required.')
      if(variant.store.status==='SUSPENDED')throw errors.forbidden('Store is suspended.')
      if(variant.product.productKind!=='GOODS')throw errors.badRequest('Stock adjustments are for physical goods. Service capacity and digital entitlements are separate.')
      const prior=await tx.marketplaceStockMovement.findUnique({
        where:{variantId_requestKey:{variantId:id,requestKey:input.requestKey}},
      })
      if(prior) {
        if(prior.qtyDelta!==input.delta||prior.reason!==input.reason)
          throw errors.conflict('This stock operation key was used with different details.')
        return {applied:false,stockOnHand:prior.balanceAfter,delta:prior.qtyDelta,movementId:prior.id}
      }
      if(!stockChangeAllowed(variant.stockOnHand,variant.stockReserved,input.delta))
        throw errors.conflict('Stock cannot fall below quantities reserved for buyers.')
      const updated=await tx.marketplaceVariant.update({
        where:{id},data:{stockOnHand:{increment:input.delta}},
        select:{stockOnHand:true,stockReserved:true},
      })
      const movement=await tx.marketplaceStockMovement.create({data:{
        variantId:id,actorId:userId,requestKey:input.requestKey,
        reason:input.reason,qtyDelta:input.delta,balanceAfter:updated.stockOnHand,
      },select:{id:true}})
      return {applied:true,stockOnHand:updated.stockOnHand,
        available:availableStock(updated.stockOnHand,updated.stockReserved),
        delta:input.delta,movementId:movement.id}
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
    if(result.applied)await audit({
      actorUserId:userId,actorLabel:'store-owner',action:'marketplace.stock.adjust',
      entityType:'MarketplaceVariant',entityId:id,after:{delta:input.delta,requestKey:input.requestKey},
    })
    return result
  }catch(error){
    if(uniqueConflict(error)||serialConflict(error))
      throw errors.conflict('Stock was updated by another request. Refresh and retry using the same operation key.')
    throw error
  }
}
export async function variantStockHistory(id:string,userId:string){
  const variant=await db.marketplaceVariant.findUnique({
    where:{id},select:{id:true,store:{select:{ownerId:true}}},
  })
  if(!variant)throw errors.notFound('Variant not found.')
  if(variant.store.ownerId!==userId)throw errors.forbidden('Seller permission required.')
  return db.marketplaceStockMovement.findMany({where:{variantId:id},
    orderBy:{createdAt:'desc'},take:50,
    select:{id:true,reason:true,qtyDelta:true,balanceAfter:true,createdAt:true},
  })
}

export async function changeVariantPrice(id:string,userId:string,raw:unknown){
  const input=parseVariantPriceChange(raw)
  try{
    return await db.$transaction(async tx=>{
      const variant=await tx.marketplaceVariant.findUnique({where:{id},include:{
        store:{select:{ownerId:true,status:true,deletedAt:true}},
        product:{select:{status:true,deletedAt:true}},
      }})
      if(!variant||variant.store.deletedAt||variant.product.deletedAt)throw errors.notFound('Product variant not found.')
      if(variant.store.ownerId!==userId)throw errors.forbidden('Seller permission required.')
      if(variant.store.status==='SUSPENDED'||variant.product.status==='ARCHIVED'||!variant.active)
        throw errors.conflict('This variant cannot be edited.')
      if(variant.currency!=='GHS')throw errors.conflict('Unsupported currency.')
      if(variant.priceMinor!==input.expectedPriceMinor)throw errors.conflict('Price changed elsewhere. Refresh the catalogue and try again.')
      if(variant.priceMinor===input.priceMinor)return {id,priceMinor:variant.priceMinor}
      const result=await tx.marketplaceVariant.updateMany({where:{id,priceMinor:input.expectedPriceMinor},data:{priceMinor:input.priceMinor}})
      if(result.count!==1)throw errors.conflict('Price changed elsewhere. Refresh and try again.')
      await tx.auditLog.create({data:{actorUserId:userId,actorLabel:'store-owner',action:'marketplace.variant.price',
        entityType:'MarketplaceVariant',entityId:id,before:JSON.stringify({priceMinor:variant.priceMinor}),
        after:JSON.stringify({priceMinor:input.priceMinor})}})
      return {id,priceMinor:input.priceMinor}
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
  }catch(error){
    if(serialConflict(error))throw errors.conflict('Price changed elsewhere. Refresh and try again.')
    throw error
  }
}
