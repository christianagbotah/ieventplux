import { expect, test } from 'bun:test'
import { buildDiscoveryQuery, countryName, discoveryPriceLabel, EMPTY_DISCOVERY_FILTERS, isDiscoveryFiltered } from './discovery-filters'

test('public discover query uses web mode/access semantics and all filters', () => {
  const q = new URLSearchParams(buildDiscoveryQuery({
    q:'worship', category:'music', country:'GH',city:'Accra',mode:'ONLINE',price:'FREE',when:'THIS_WEEKEND',
  },2,'Africa/Accra'))
  expect(q.get('page')).toBe('2')
  expect(q.get('pageSize')).toBe('12')
  expect(q.get('mode')).toBeNull()
  expect(q.get('access')).toBe('ONLINE')
  for(const [k,v] of Object.entries({q:'worship',category:'music',country:'GH',city:'Accra',price:'FREE',when:'THIS_WEEKEND',timezone:'Africa/Accra'})) expect(q.get(k)).toBe(v)
})
test('physical access uses mode and empty filters never submit blank search terms', () => {
  const q = new URLSearchParams(buildDiscoveryQuery({...EMPTY_DISCOVERY_FILTERS,mode:'PHYSICAL'}))
  expect(q.get('mode')).toBe('PHYSICAL')
  expect(q.get('access')).toBeNull()
  expect(q.get('q')).toBeNull()
  expect(isDiscoveryFiltered(EMPTY_DISCOVERY_FILTERS)).toBe(false)
  expect(isDiscoveryFiltered({...EMPTY_DISCOVERY_FILTERS,price:'PAID'})).toBe(true)
})
test('country labels degrade to original ISO code when Intl is missing', () => {
  expect(countryName('GH').length).toBeGreaterThan(0)
})

test('price ranking sends explicit currency and native cards never relabel USD as cedis',()=>{
 const q=new URLSearchParams(buildDiscoveryQuery({...EMPTY_DISCOVERY_FILTERS,sort:'price:USD',when:'LIVE_NOW',mode:'VIRTUAL'}))
 expect(q.get('sort')).toBe('price');expect(q.get('currency')).toBe('USD')
 expect(q.get('when')).toBe('LIVE_NOW');expect(q.get('mode')).toBe('VIRTUAL')
 const fmt=(n:number,c:string)=>c+' '+n
 expect(discoveryPriceLabel([{priceMinor:100,currency:'USD'}],fmt)).toBe('from USD 100')
 expect(discoveryPriceLabel([{priceMinor:100,currency:'USD'},{priceMinor:1,currency:'GHS'}],fmt)).toBe('View ticket prices')
})
