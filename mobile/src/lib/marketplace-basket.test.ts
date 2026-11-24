import {expect,test} from 'bun:test'
import {marketplaceBasketSelection} from './marketplace-basket'
test('native cart only submits quantity and variant ID for server verification',()=>{
  expect(marketplaceBasketSelection({variant0000002:0,variant0000003:2,variant0000001:1.5,variant0000004:1}))
    .toEqual([{variantId:'variant0000003',quantity:2},{variantId:'variant0000004',quantity:1}])
})
