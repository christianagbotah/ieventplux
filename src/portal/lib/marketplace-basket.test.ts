import {expect,test} from 'bun:test'
import {basketSelection} from './marketplace-basket'
test('local selection only sends positive unit counts; server owns all prices',()=>{
 expect(basketSelection({clvariant001:2,clvariant002:0,clvariant003:-2,clvariant004:1.5,clvariant005:1}))
  .toEqual([{variantId:'clvariant001',quantity:2},{variantId:'clvariant005',quantity:1}])
})
