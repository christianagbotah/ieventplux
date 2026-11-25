import {expect,test} from 'bun:test'
import {marketplaceBasketSelection,canAddBasketUnit} from './marketplace-basket'
test('native cart only submits quantity and variant ID for server verification',()=>{
  expect(marketplaceBasketSelection({variant0000002:0,variant0000003:2,variant0000001:1.5,variant0000004:1}))
    .toEqual([{variantId:'variant0000003',quantity:2},{variantId:'variant0000004',quantity:1}])
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
