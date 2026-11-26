import {expect,test} from 'bun:test'
import {parseDiscoverySort,validDiscoveryDate,orderByIds} from './discovery-sort'
test('sort must be explicit and price requires a single currency',()=>{
 expect(parseDiscoverySort(null,null)).toEqual({kind:'upcoming'})
 expect(parseDiscoverySort('newest',null)).toEqual({kind:'newest'})
 expect(parseDiscoverySort('price','GHS')).toEqual({kind:'price',currency:'GHS'})
 expect(parseDiscoverySort('price',null)).toBeNull()
 expect(parseDiscoverySort('price','GH')).toBeNull()
 expect(parseDiscoverySort('invalid',null)).toBeNull()
})
test('reject invalid date input and preserve aggregate ordering',()=>{
 expect(validDiscoveryDate('invalid')).toBe(false)
 expect(validDiscoveryDate('2026-11-26T10:00:00Z')).toBe(true)
 expect(orderByIds([{id:'a'},{id:'b'}],['b','a','missing'])).toEqual([{id:'b'},{id:'a'}])
})
