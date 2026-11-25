import {expect,test} from 'bun:test'
import {basketSelection,canAddBasketUnit} from './marketplace-basket'
test('local selection only sends positive unit counts; server owns all prices',()=>{
 expect(basketSelection({clvariant001:2,clvariant002:0,clvariant003:-2,clvariant004:1.5,clvariant005:1}))
  .toEqual([{variantId:'clvariant001',quantity:2},{variantId:'clvariant005',quantity:1}])
})

test('basket add control matches server per-option, unit and distinct-option caps',()=>{
  const full=Object.fromEntries(Array.from({length:15},(_,i)=>['id'+i,1]))
  expect(canAddBasketUnit(full,'new',10)).toBe(false)
  expect(canAddBasketUnit(full,'id0',10)).toBe(true)
  expect(canAddBasketUnit({a:20,b:20,c:10},'c',20)).toBe(false)
  expect(canAddBasketUnit({a:20},'a',30)).toBe(false)
  expect(canAddBasketUnit({a:2},'a',2)).toBe(false)
  expect(canAddBasketUnit({},'a',1)).toBe(true)
})
