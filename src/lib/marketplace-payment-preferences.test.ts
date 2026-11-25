import {expect,test} from 'bun:test'
import {DEFAULT_PREFERENCES,parsePaymentPreferences,parseCommissionRule,effectiveCommission} from './marketplace-payment-preferences'
test('preferences cannot set account numbers, recipient identifiers, approval or checkout',()=>{
 expect(parsePaymentPreferences({...DEFAULT_PREFERENCES,mobileMoney:true,destination:'MOMO'}).destination).toBe('MOMO')
 for(const patch of [{checkoutEnabled:true},{verified:true},{subaccountCode:'ACCT_example'},{accountNumber:'123456789'},{mobileMoney:'true'},{destination:'OTHER'}])expect(()=>parsePaymentPreferences({...DEFAULT_PREFERENCES,...patch})).toThrow()
})
test('commission precedence and explicit unset rate',()=>{
 const store={id:'abc',category:'Fashion'}
 const rules=[{key:'global',basisPoints:1000},{key:'category:Fashion',basisPoints:500},{key:'store:abc',basisPoints:0}]
 expect(effectiveCommission(rules,store)?.basisPoints).toBe(0)
 expect(effectiveCommission(rules.slice(0,2),store)?.basisPoints).toBe(500)
 expect(effectiveCommission(rules.slice(0,1),store)?.basisPoints).toBe(1000)
 expect(effectiveCommission([],store)).toBeNull()
})
test('commission inputs must be bounded integer basis points and known scopes',()=>{
 expect(parseCommissionRule({scope:'global',target:'',basisPoints:1000}).basisPoints).toBe(1000)
 expect(parseCommissionRule({scope:'category',target:'Fashion',basisPoints:null}).basisPoints).toBeNull()
 for(const rule of [{scope:'global',target:'',basisPoints:10000},{scope:'global',target:'',basisPoints:1.5},{scope:'global',target:'x',basisPoints:10},{scope:'category',target:'Bogus',basisPoints:10},{scope:'store',target:'../admin',basisPoints:10},{scope:'global',target:'',basisPoints:10,checkoutEnabled:true}])expect(()=>parseCommissionRule(rule)).toThrow()
})
