import { describe, expect, test } from 'bun:test'
import { interpretCatalogueQuery } from './catalogue-search'

const categories = [{slug:'music',name:'Music'}, {slug:'community',name:'Community'}, {slug:'church',name:'Church'}]
const cities = ['Accra','Tema','Ashaiman','New York']

describe('Honest catalogue search while AI is off', () => {
  test('extracts real city/category and free date without fabrication', () => {
    expect(interpretCatalogueQuery('Find free church events in Accra this weekend', categories, cities)).toEqual({
      category:'church',city:'Accra',price:'FREE',when:'THIS_WEEKEND',mode:null,keywords:null,
    })
  })
  test('supports virtual search from any location', () => {
    const r=interpretCatalogueQuery('online music concerts', categories, cities)
    expect(r.mode).toBe('VIRTUAL')
    expect(r.category).toBe('music')
    expect(r.keywords).toBe('concerts')
  })
  test('keeps unknown locations as text search rather than inventing a city', () => {
    const r=interpretCatalogueQuery('workshops in Tokyo', categories, cities)
    expect(r.city).toBeNull()
    expect(r.keywords).toBe('workshops tokyo')
  })
  test('avoids guessing events or pricing from empty catalogue', () => {
    const r=interpretCatalogueQuery('Any events today?',[],[])
    expect(r.when).toBe('TODAY')
    expect(r.keywords).toBeNull()
    expect(r.city).toBeNull()
  })
})
