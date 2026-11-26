import { expect, test } from 'bun:test'
import { parsePushKey, parsePushRegistration } from './push-installation-policy'
const valid={installationKey:'x'.repeat(43),providerToken:'ExpoPushToken[synthetic_token_12345]',platform:'ANDROID',permissionGranted:true}
test('only an explicit permission grant and valid installation capability register',()=>{
 const parsed=parsePushRegistration(valid)
 expect(parsed?.keyHash).toHaveLength(64)
 expect(parsed?.keyHash).not.toBe(valid.installationKey)
 for(const input of [{...valid,permissionGranted:false},{...valid,installationKey:'device-id'},{...valid,providerToken:'https://example.invalid'},{...valid,platform:'WEB'},null])expect(parsePushRegistration(input)).toBeNull()
})
test('keys are not trimmed or accepted from arbitrary objects',()=>{
 expect(parsePushKey(' '+valid.installationKey)).toBeNull()
 expect(parsePushKey({key:valid.installationKey})).toBeNull()
 expect(parsePushKey(valid.installationKey)).toBe(parsePushKey(valid.installationKey))
})
