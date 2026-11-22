import { describe, expect, test } from 'bun:test'
import { personFormError, souvenirFormError, souvenirPriceMinor, programmePdfError, eventImageError } from './event-programme-form'

describe('organizer lineup editor validation', () => {
  const person = { name: 'Main Speaker', role: 'MAIN_SPEAKER', startsAt: '2026-12-06T08:00', endsAt: '2026-12-06T09:00', sortOrder: '0' }
  test('valid speaker and unscheduled artist', () => {
    expect(personFormError(person)).toBe(null)
    expect(personFormError({ ...person, startsAt: '', endsAt: '' })).toBe(null)
  })
  test('invalid role, empty name and bad sort order', () => {
    expect(personFormError({ ...person, name: ' ' })).toContain('name')
    expect(personFormError({ ...person, role: 'ADMIN' })).toContain('role')
    expect(personFormError({ ...person, sortOrder: '1.3' })).toContain('whole')
  })
  test('a finish cannot precede the start or exist alone', () => {
    expect(personFormError({ ...person, startsAt: '' })).toContain('start')
    expect(personFormError({ ...person, endsAt: '2026-12-06T08:00' })).toContain('later')
    expect(personFormError({ ...person, endsAt: '2026-12-06T07:59' })).toContain('later')
    expect(personFormError({ ...person, startsAt: '2026-02-30T08:00' })).toContain('valid')
  })
})
describe('merchandise setup, not checkout', () => {
  const product = { name: 'Official T-shirt', sku: 'SHILOH-S-BLACK', price: '45.50', stockTotal: '200', sortOrder: '5' }
  test('accepted money uses exact pesewas and does not round fractions', () => {
    expect(souvenirFormError(product)).toBe(null)
    expect(souvenirPriceMinor('45.50')).toBe(4550)
    expect(souvenirPriceMinor('0.01')).toBe(1)
    expect(souvenirPriceMinor('1000000.00')).toBe(100000000)
    expect(souvenirPriceMinor('45.999')).toBe(null)
    expect(souvenirPriceMinor('1e3')).toBe(null)
  })
  test('bad sku, quantity or price are rejected before network calls', () => {
    expect(souvenirFormError({ ...product, sku: '!' })).toContain('SKU')
    expect(souvenirFormError({ ...product, stockTotal: '-1' })).toContain('stock')
    expect(souvenirFormError({ ...product, price: '0.00' })).toContain('positive')
    expect(souvenirFormError({ ...product, sortOrder: '1001' })).toContain('order')
  })
})
describe('media upload guidance mirrors API size/type constraints', () => {
  test('PDF requires correct MIME and size', () => {
    expect(programmePdfError({ type: 'application/pdf', size: 1234 })).toBe(null)
    expect(programmePdfError({ type: 'application/pdf', size: 0 })).toContain('larger')
    expect(programmePdfError({ type: 'text/plain', size: 123 })).toContain('PDF')
    expect(programmePdfError({ type: 'application/pdf', size: 11 * 1024 * 1024 })).toContain('10 MB')
  })
  test('profile and merch images accept real supported formats only', () => {
    expect(eventImageError({ type: 'image/webp', size: 5000 })).toBe(null)
    expect(eventImageError({ type: 'image/svg+xml', size: 5000 })).toContain('PNG')
    expect(eventImageError({ type: 'image/png', size: 6 * 1024 * 1024 })).toContain('5 MB')
  })
})
