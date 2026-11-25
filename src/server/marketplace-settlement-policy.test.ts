import {expect,test} from 'bun:test'
import {planMarketplaceSettlement} from './marketplace-settlement-policy'
const account={provider:'PAYSTACK',country:'GH',verified:true,subaccountCode:'ACCT_test123'} as const
test('allocates gross amounts without custody or charging',()=>{
 const p=planMarketplaceSettlement(10000,1000,account)
 expect(p.sellerMinor).toBe(9000)
 expect(p.platformMinor).toBe(1000)
 expect(p.providerParameters.transaction_charge).toBe(1000)
 expect(p.activation).toBe('NOT_ENABLED')
})
test('rounding preserves the gross total',()=>{
 const p=planMarketplaceSettlement(199,1000,account)
 expect(p.sellerMinor+p.platformMinor).toBe(199)
 expect(p.platformMinor).toBe(20)
})
test('rejects unverified accounts and invalid money or commission',()=>{
 expect(()=>planMarketplaceSettlement(10000,1000,{...account,verified:false})).toThrow()
 expect(()=>planMarketplaceSettlement(10000,10001,account)).toThrow()
 expect(()=>planMarketplaceSettlement(100.1,1000,account)).toThrow()
 expect(()=>planMarketplaceSettlement(10000,10000,account)).toThrow()
})
