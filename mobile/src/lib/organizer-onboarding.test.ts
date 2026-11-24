import {expect,test} from 'bun:test'
import {ORGANIZER_CATEGORIES,ORGANIZER_PROFILE_FIELDS,EMPTY_ORGANIZER_FORM,validateOrganizerOnboarding,organizerOnboardingPayload} from './organizer-onboarding'
import {readFileSync} from 'node:fs'

test('native organizer categories exactly match authoritative web/server categories',()=>{
  const source=readFileSync(new URL('../../../src/lib/organization-types.ts',import.meta.url),'utf8')
  const original=source.match(/export const ORGANIZER_TYPES = \[([^\]]+)\]/)?.[1]
  expect(original).toBeTruthy()
  const types=[...original!.matchAll(/'([A-Z_]+)'/g)].map(x=>x[1])
  expect(ORGANIZER_CATEGORIES.map(x=>x.value).sort()).toEqual(types.sort())
  for (const t of types)expect(ORGANIZER_PROFILE_FIELDS[t as keyof typeof ORGANIZER_PROFILE_FIELDS].length).toBeGreaterThan(0)
})
test('organizer creation requires name and category, not verification skip',()=>{
  expect(validateOrganizerOnboarding(EMPTY_ORGANIZER_FORM)).toContain('type')
  const valid={...EMPTY_ORGANIZER_FORM,orgType:'CHURCH' as const,name:'Grace Conference Chapel'}
  expect(validateOrganizerOnboarding(valid)).toBeNull()
  expect(validateOrganizerOnboarding({...valid,website:'http://unsafe.example'})).toContain('HTTPS')
  expect(validateOrganizerOnboarding({...valid,contactEmail:'bad-email'})).toContain('valid')
})
test('payload includes only organizer-type-specific public profile fields',()=>{
  const payload=organizerOnboardingPayload({...EMPTY_ORGANIZER_FORM,orgType:'CHURCH',name:'Assembly Worship',
    profileDetails:{branchName:' Promise Land ',eventFocus:'ignore cross-type field',registrationNumber:'private',leadPastor:' Pastor Y '} })
  expect(payload.profileDetails).toEqual({branchName:'Promise Land',leadPastor:'Pastor Y'})
  expect('verifiedAt' in payload).toBe(false)
  expect('status' in payload).toBe(false)
})
test('public creator entry actions stay inside native navigation',()=>{
  const source=readFileSync(new URL('../screens/DiscoverScreen.tsx',import.meta.url),'utf8')
  expect(source.includes("navigation.navigate(status === 'authenticated' ? 'OrganizerStudio' : 'Login')")).toBe(true)
  expect(source.includes('ieventplux.lightworldtech.com/#/create-org')).toBe(false)
})

test('native public onboarding does not solicit company registration identifiers',()=>{
  expect(ORGANIZER_PROFILE_FIELDS.COMPANY.some(x=>x.key==='registrationNumber')).toBe(false)
})
