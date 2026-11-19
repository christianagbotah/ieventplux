import { describe, expect, test } from 'bun:test'
import { normalizeOrganizerDetails, readOrganizerDetails, publicOrganizerDetails } from './org-profile-details'
import { organizerType, ORGANIZER_TYPE_CONFIG } from '@/lib/organization-types'
import { kycRequirements } from './kyc-requirements'

describe('organizer-type-specific profiles', () => {
  test('all six categories have different names and type-specific form definitions', () => {
    const types = ['INDIVIDUAL', 'CHURCH', 'SCHOOL', 'COMPANY', 'MINISTRY', 'ASSOCIATION'] as const
    for (const type of types) {
      expect(organizerType(type)).toBe(type)
      expect(ORGANIZER_TYPE_CONFIG[type].fields.length).toBeGreaterThanOrEqual(2)
      expect(ORGANIZER_TYPE_CONFIG[type].namePlaceholder.length).toBeGreaterThan(3)
    }
    expect(organizerType('FAKE')).toBeNull()
  })
  test('personal only saves personal details, never submitted business fields', () => {
    const normalized = JSON.parse(normalizeOrganizerDetails({ publicRole: 'Event planner', eventFocus: 'Weddings', registrationNumber: 'SHOULD-NOT-SAVE', denomination: 'No' }, 'INDIVIDUAL'))
    expect(normalized).toEqual({ publicRole: 'Event planner', eventFocus: 'Weddings' })
  })
  test('school branch and education level are preserved, company details are separate', () => {
    const stored = normalizeOrganizerDetails({ campusName: 'East Campus', schoolLevel: 'KG to SHS', industry: 'Hidden' }, 'SCHOOL')
    expect(readOrganizerDetails(stored, 'SCHOOL')).toEqual({ schoolLevel: 'KG to SHS', campusName: 'East Campus' })
    expect(readOrganizerDetails(stored, 'INDIVIDUAL')).toEqual({})
  })
  test('registration number stays private in public organizer profiles', () => {
    const stored = normalizeOrganizerDetails({ industry: 'Events', registrationNumber: 'COMPANY-1234' }, 'COMPANY')
    expect(readOrganizerDetails(stored, 'COMPANY').registrationNumber).toBe('COMPANY-1234')
    expect(publicOrganizerDetails(stored, 'COMPANY')).toEqual({ industry: 'Events' })
  })
  test('bad data is rejected and malformed saved JSON is safe to read', () => {
    expect(() => normalizeOrganizerDetails(['No'], 'SCHOOL')).toThrow()
    expect(() => normalizeOrganizerDetails({ schoolHead: 123 }, 'SCHOOL')).toThrow()
    expect(() => normalizeOrganizerDetails({ schoolHead: 'x'.repeat(161) }, 'SCHOOL')).toThrow()
    expect(readOrganizerDetails('{broken', 'SCHOOL')).toEqual({})
  })
  test('personal KYC excludes business registration; school and company require institutional documents', () => {
    expect(kycRequirements('INDIVIDUAL', []).some((row) => row.key === 'REGISTRATION')).toBe(false)
    expect(kycRequirements('CHURCH', []).some((row) => row.key === 'REGISTRATION')).toBe(false)
    expect(kycRequirements('SCHOOL', []).find((row) => row.key === 'REGISTRATION')?.label).toContain('School')
    expect(kycRequirements('COMPANY', []).find((row) => row.key === 'REGISTRATION')?.label).toContain('Company')
  })
})
