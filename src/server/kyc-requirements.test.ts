import { describe, expect, test } from 'bun:test'
import { kycRequirements, missingKycRequirements, type IdentityEvidence } from './kyc-requirements'

const front: IdentityEvidence = { kind: 'GOVERNMENT_ID', side: 'FRONT' }
const back: IdentityEvidence = { kind: 'GOVERNMENT_ID', side: 'BACK' }
const selfie: IdentityEvidence = { kind: 'SELFIE' }
const registration: IdentityEvidence = { kind: 'BUSINESS_REGISTRATION' }

describe('identity document completeness', () => {
  test('a new individual requires both sides of the ID and a selfie', () => {
    expect(missingKycRequirements('INDIVIDUAL', [])).toHaveLength(3)
    expect(missingKycRequirements('INDIVIDUAL', [front, selfie]).map((r) => r.key)).toEqual(['ID_BACK'])
    expect(missingKycRequirements('INDIVIDUAL', [front, back, selfie])).toHaveLength(0)
  })
  test('a company additionally needs registration evidence', () => {
    expect(missingKycRequirements('COMPANY', [front, back, selfie]).map((r) => r.key)).toEqual(['REGISTRATION'])
    expect(missingKycRequirements('COMPANY', [front, back, selfie, registration])).toHaveLength(0)
  })
  test('legacy single-side ID remains available as front, but never satisfies back', () => {
    const oldId: IdentityEvidence = { kind: 'GOVERNMENT_ID' }
    expect(kycRequirements('COMPANY', [oldId]).find((r) => r.key === 'ID_FRONT')?.complete).toBe(true)
    expect(missingKycRequirements('COMPANY', [oldId]).map((r) => r.key)).toEqual(['ID_BACK', 'SELFIE', 'REGISTRATION'])
  })
  test('a back-only ID does not masquerade as a front', () => {
    expect(missingKycRequirements('INDIVIDUAL', [back, selfie]).map((r) => r.key)).toEqual(['ID_FRONT'])
  })
  test('registration and duplicate selfie cannot replace missing ID evidence', () => {
    const remaining = missingKycRequirements('COMPANY', [registration, selfie, selfie])
    expect(remaining.map((r) => r.key)).toEqual(['ID_FRONT', 'ID_BACK'])
  })
})
