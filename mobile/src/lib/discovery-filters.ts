/** Same event-discovery query semantics as the Next.js public portal. */
export type DateWindow = '' | 'TODAY' | 'THIS_WEEK' | 'THIS_WEEKEND' | 'LIVE_NOW'
export type EntryPrice = '' | 'FREE' | 'PAID'
export type EventAccess = '' | 'ONLINE' | 'PHYSICAL' | 'HYBRID' | 'VIRTUAL'
export type DiscoveryFilters = {
  q: string
  category: string
  country: string
  city: string
  mode: EventAccess
  price: EntryPrice
  when: DateWindow
  sort?: string
}
export const EMPTY_DISCOVERY_FILTERS: DiscoveryFilters = {
  q: '', category: '', country: '', city: '', mode: '', price: '', when: '',
}

export function isDiscoveryFiltered(filters: DiscoveryFilters): boolean {
  return Object.values(filters).some(value => !!value?.trim())
}

export function buildDiscoveryQuery(filters: DiscoveryFilters, page = 1, timeZone = 'UTC'): string {
  const params = new URLSearchParams({ page: String(page), pageSize: '12' })
  for (const key of ['q', 'category', 'country', 'city', 'price', 'when'] as const) {
    const value = filters[key].trim()
    if (value) params.set(key, value)
  }
  // Keep the web portal mapping: ONLINE means virtual OR hybrid access.
  // Do not send mode=ONLINE; the server's `access` filter handles both.
  if (filters.mode === 'ONLINE') params.set('access', 'ONLINE')
  else if (filters.mode) params.set('mode', filters.mode)
  if(filters.sort==='newest')params.set('sort','newest')
  else if(filters.sort?.startsWith('price:')){params.set('sort','price');params.set('currency',filters.sort.slice(6))}
  params.set('timezone', timeZone)
  return params.toString()
}

export const DATE_WINDOWS: { value: DateWindow; label: string }[] = [
  {value:'',label:'Any date'},
  {value:'TODAY',label:'Today'},
  {value:'THIS_WEEK',label:'This week'},
  {value:'THIS_WEEKEND',label:'This weekend'},
  {value:'LIVE_NOW',label:'Live now'},
]
export const PRICE_OPTIONS: { value: EntryPrice; label: string }[] = [
  {value:'',label:'Any price'},
  {value:'FREE',label:'Free'},
  {value:'PAID',label:'Paid'},
]
export const ACCESS_OPTIONS: { value: EventAccess; label: string }[] = [
  {value:'',label:'Anywhere'},
  {value:'ONLINE',label:'Online & hybrid'},
  {value:'PHYSICAL',label:'In person'},
  {value:'VIRTUAL',label:'Online only'},
  {value:'HYBRID',label:'Hybrid'},
]

export function countryName(code: string): string {
  try {
    const supported = Intl as typeof Intl & { DisplayNames?: new (locale: string[], options: { type: 'region' }) => { of: (code: string) => string | undefined } }
    return supported.DisplayNames ? new supported.DisplayNames(['en'], {type:'region'}).of(code) || code : code
  } catch { return code }
}

export const DISCOVERY_SORT_OPTIONS=[
 {value:'',label:'Event start date'},
 {value:'newest',label:'Recently added'},
 {value:'price:GHS',label:'Lowest price (₵)'},
 {value:'price:USD',label:'Lowest price (USD)'},
 {value:'price:EUR',label:'Lowest price (EUR)'},
 {value:'price:GBP',label:'Lowest price (GBP)'},
]
export function discoveryPriceLabel(tickets:{priceMinor:number;currency?:string}[],format:(amount:number,currency:string)=>string){
 if(!tickets.length)return 'Ticketing TBA'
 if(new Set(tickets.map(t=>t.currency??'GHS')).size>1)return 'View ticket prices'
 const min=Math.min(...tickets.map(t=>t.priceMinor))
 return min===0?'Free':'from '+format(min,tickets[0]?.currency??'GHS')
}
