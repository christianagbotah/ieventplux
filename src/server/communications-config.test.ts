import { describe, expect, test } from 'bun:test'
import { validSmtpHost, validSmtpPort, validSmtpFrom, encryptSmtpPassword, decryptSmtpPassword } from './communications-config'

describe('Secure mail administration settings', () => {
  test('rejects internal, local and malformed mail hosts', () => {
    for (const host of ['localhost', '127.0.0.1', 'smtp.local', 'smtp.internal', '169.254.169.254', 'example.com:587', 'smtp.invalid']) expect(validSmtpHost(host)).toBe(false)
    expect(validSmtpHost('smtp.gmail.com')).toBe(true)
    expect(validSmtpHost('mail.lightworldtech.com')).toBe(true)
  })
  test('validates sender addresses and supported SMTP ports', () => {
    expect(validSmtpFrom('ieventplux@lightworldtech.com')).toBe(true)
    expect(validSmtpFrom('No Reply <hello@example.com>')).toBe(false)
    expect(validSmtpPort(587)).toBe(true)
    expect(validSmtpPort(465)).toBe(true)
    expect(validSmtpPort(25)).toBe(false)
  })
  test('secrets are authenticated and not stored as readable values', () => {
    const value = 'TestOnly-AppPassword-1234'
    const encrypted = encryptSmtpPassword(value)
    expect(encrypted.startsWith('enc1:')).toBe(true)
    expect(encrypted.includes(value)).toBe(false)
    expect(decryptSmtpPassword(encrypted)).toBe(value)
    expect(() => decryptSmtpPassword(encrypted.slice(0, -6) + 'wrong!')).toThrow()
  })
})
