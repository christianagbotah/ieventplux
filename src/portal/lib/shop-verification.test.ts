import {expect,test} from 'bun:test'
import {isEmailVerificationRequired,shopVerificationHref,shopVerificationReturn} from './shop-verification'
test('shop verification uses a local return link only',()=>{
 expect(shopVerificationHref('ghana-crafts')).toBe('#/verify-email?returnTo=%2Fshop%2Fghana-crafts')
 expect(shopVerificationReturn('/shop/ghana-crafts')).toBe('/shop/ghana-crafts')
 for(const bad of ['https://example.com','//example.com','/admin','/shop/a?x=y','/shop/../admin','/shop/%2f','/shop/a#b']) expect(shopVerificationReturn(bad)).toBeNull()
 expect(shopVerificationHref('../admin')).toBe('#/verify-email')
})
test('verification action only follows the explicit 403 code',()=>{
 expect(isEmailVerificationRequired({code:'EMAIL_VERIFICATION_REQUIRED',status:403})).toBe(true)
 expect(isEmailVerificationRequired({code:'FORBIDDEN',status:403})).toBe(false)
 expect(isEmailVerificationRequired({code:'EMAIL_VERIFICATION_REQUIRED',status:500})).toBe(false)
 expect(isEmailVerificationRequired(null)).toBe(false)
})
