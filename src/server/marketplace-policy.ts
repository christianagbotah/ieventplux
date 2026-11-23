/**
 * 24/7 seller storefront validation.
 * No buyer checkout or payment collection until merchant settlement gates.
 */
export class MarketplacePolicyError extends Error {}

function cleaned(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max + 1) : ''
}
function optionalText(value: unknown, max: number): string | null {
  const v = cleaned(value, max)
  if (v.length > max) throw new MarketplacePolicyError('A text field is too long.')
  return v || null
}
function httpsUrl(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.length > 1800) throw new MarketplacePolicyError('Image or website URL is invalid.')
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:' || u.username || u.password || u.hash) throw new Error('not https')
    return u.toString()
  } catch { throw new MarketplacePolicyError('Images and websites must use valid HTTPS URLs.') }
}
function slug(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{2,58}[a-z0-9]$/.test(value))
    throw new MarketplacePolicyError('Use a lowercase address of 4–60 letters, numbers and hyphens.')
  return value
}
export type StoreDraft = {
  name: string; slug: string; tagline: string | null; description: string | null
  category: string; logoUrl: string | null; coverUrl: string | null
  website: string | null; city: string | null; pickupAddress: string | null
}
export function parseStoreDraft(raw: unknown): StoreDraft {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') throw new MarketplacePolicyError('Store information is required.')
  const x = raw as Record<string, unknown>
  const name = cleaned(x.name, 100)
  if (name.length < 3 || name.length > 100) throw new MarketplacePolicyError('Store name must be 3–100 characters.')
  const category = cleaned(x.category, 60)
  if (category.length < 2 || category.length > 60) throw new MarketplacePolicyError('Store category must be 2–60 characters.')
  return { name, slug: slug(x.slug), category,
    tagline: optionalText(x.tagline, 180), description: optionalText(x.description, 2400),
    logoUrl: httpsUrl(x.logoUrl), coverUrl: httpsUrl(x.coverUrl),
    website: httpsUrl(x.website), city: optionalText(x.city, 90),
    pickupAddress: optionalText(x.pickupAddress, 350),
  }
}
export type VariantDraft = {
  title: string; sku: string; optionValues: string; priceMinor: number
}
export type ProductDraft = {
  name: string; slug: string; shortDesc: string | null; description: string
  brand: string | null; category: string; specifications: string; images: string
  productKind: 'GOODS' | 'DIGITAL' | 'SERVICE'; variants: VariantDraft[]
}
export function parseProductDraft(raw: unknown): ProductDraft {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') throw new MarketplacePolicyError('Product details are required.')
  const x = raw as Record<string, unknown>
  const name = cleaned(x.name, 150), description = cleaned(x.description, 8000)
  const category = cleaned(x.category, 90)
  if (name.length < 3 || name.length > 150) throw new MarketplacePolicyError('Product name must be 3–150 characters.')
  if (description.length < 15 || description.length > 8000) throw new MarketplacePolicyError('Provide a full product description (15–8,000 characters).')
  if (category.length < 2 || category.length > 90) throw new MarketplacePolicyError('Product category is required.')
  const productKind = x.productKind ?? 'GOODS'
  if (productKind !== 'GOODS' && productKind !== 'SERVICE' && productKind !== 'DIGITAL')
    throw new MarketplacePolicyError('Unsupported product type.')
  const specs = x.specifications ?? {}
  if (!specs || typeof specs !== 'object' || Array.isArray(specs) || Object.keys(specs).length > 30)
    throw new MarketplacePolicyError('Use at most 30 specification fields.')
  const pairs: Record<string,string> = {}
  for (const [key,value] of Object.entries(specs)) {
    if (!/^[\p{L}\p{N} _-]{2,70}$/u.test(key) ||
        typeof value !== 'string' || !value.trim() || value.length > 300)
      throw new MarketplacePolicyError('Invalid product specification key or value.')
    pairs[key] = value.trim()
  }
  if (!Array.isArray(x.images) || x.images.length > 10)
    throw new MarketplacePolicyError('Products support up to 10 HTTPS images.')
  const images = x.images.map(item => httpsUrl(item))
  if (images.some(item => !item)) throw new MarketplacePolicyError('Product images must be valid HTTPS URLs.')
  if (!Array.isArray(x.variants) || !x.variants.length || x.variants.length > 24)
    throw new MarketplacePolicyError('Provide 1–24 distinct product variants.')
  const seen = new Set<string>()
  const variants: VariantDraft[] = x.variants.map(v => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new MarketplacePolicyError('Invalid variant.')
    const y = v as Record<string,unknown>
    const title = cleaned(y.title, 90)
    const sku = typeof y.sku === 'string' ? y.sku.toUpperCase().trim() : ''
    if (title.length < 2 || title.length > 90) throw new MarketplacePolicyError('Variant title must be 2–90 characters.')
    if (!/^[A-Z0-9][A-Z0-9_-]{2,49}$/.test(sku)) throw new MarketplacePolicyError('SKU must be 3–50 letters, numbers, hyphens or underscores.')
    if (seen.has(sku)) throw new MarketplacePolicyError('SKU cannot repeat within one product.')
    seen.add(sku)
    if (typeof y.priceMinor !== 'number' || !Number.isSafeInteger(y.priceMinor) || y.priceMinor < 1 || y.priceMinor > 100_000_000)
      throw new MarketplacePolicyError('Price must be a valid positive amount in minor currency units.')
    const options = y.optionValues ?? {}
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).length > 8)
      throw new MarketplacePolicyError('Variant options must be an object with at most eight values.')
    const optionValues: Record<string,string> = {}
    for (const [key,val] of Object.entries(options)) {
      if (!/^[\p{L}\p{N} _-]{2,40}$/u.test(key) || typeof val !== 'string' || !val.trim() || val.length > 80)
        throw new MarketplacePolicyError('Invalid size, colour or variant option.')
      optionValues[key] = val.trim()
    }
    return { title, sku, priceMinor: y.priceMinor, optionValues: JSON.stringify(optionValues) }
  })
  return { name, slug: slug(x.slug), description, shortDesc: optionalText(x.shortDesc, 220),
    category, brand: optionalText(x.brand, 100), productKind,
    specifications: JSON.stringify(pairs), images: JSON.stringify(images), variants }
}
export type StockAdjustment = { delta: number; reason: string; requestKey: string }
export function parseStockAdjustment(raw: unknown): StockAdjustment {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') throw new MarketplacePolicyError('Stock adjustment required.')
  const x = raw as Record<string,unknown>
  if (typeof x.delta !== 'number' || !Number.isSafeInteger(x.delta) || x.delta === 0 || Math.abs(x.delta) > 100_000)
    throw new MarketplacePolicyError('Stock change must be a whole number of 1–100,000 units.')
  const reason = cleaned(x.reason, 200)
  if (reason.length < 4 || reason.length > 200) throw new MarketplacePolicyError('Stock change requires a meaningful reason.')
  const requestKey = typeof x.requestKey === 'string' ? x.requestKey.trim() : ''
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey)) throw new MarketplacePolicyError('A unique stock operation key is required.')
  return { delta: x.delta, reason, requestKey }
}
export function availableStock(onHand: number, reserved: number) {
  return Math.max(0, onHand - reserved)
}
export function stockChangeAllowed(onHand: number, reserved: number, delta: number) {
  return Number.isSafeInteger(onHand) && Number.isSafeInteger(reserved) && Number.isSafeInteger(delta)
    && onHand + delta >= reserved && onHand + delta >= 0
}
