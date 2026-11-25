import {expect,test} from 'bun:test'
import {parseSouvenirRequest,quoteSouvenir} from './souvenir-request-policy'
const raw={productId:'product1',requestKey:'request-1234567890',quantity:2,expectedUnitPriceMinor:5000}
const product={active:true,currency:'GHS',priceMinor:5000,stockTotal:10,stockReserved:2,stockSold:3}
test('reviewed merchandise quote uses server price and available inventory',()=>{
 expect(quoteSouvenir(parseSouvenirRequest(raw),product)).toEqual({quantity:2,unitPriceMinor:5000,totalMinor:10000,currency:'GHS'})
 for(const patch of [{active:false},{currency:'USD'},{priceMinor:4000},{stockSold:8}])expect(()=>quoteSouvenir(parseSouvenirRequest(raw),{...product,...patch})).toThrow()
})
test('invalid quantity and client-defined totals or payment status are rejected',()=>{
 for(const patch of [{quantity:0},{quantity:21},{quantity:1.5},{expectedUnitPriceMinor:0},{totalMinor:1},{status:'PAID'}])expect(()=>parseSouvenirRequest({...raw,...patch})).toThrow()
})
