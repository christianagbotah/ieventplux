import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'
import { validateIdentityNames, validateLivenessFiles, verifiedImage } from './capture'

describe('biometric upload contract', () => {
  test('requires exact legal names and correct capture count', () => {
    const form = new FormData()
    form.set('givenNames', 'Ama')
    form.set('lastName', 'Boateng')
    expect(validateIdentityNames(form)).toEqual({ givenNames: 'Ama', lastName: 'Boateng' })
    expect(() => validateLivenessFiles([])).toThrow()
    expect(() => validateLivenessFiles(Array(13).fill(new File([new Uint8Array(1024)], 'frame.jpg', { type: 'image/jpeg' })))).toThrow()
    expect(() => validateLivenessFiles(Array(3).fill(new File([new Uint8Array(1024)], 'frame.jpg', { type: 'image/jpeg' })))).not.toThrow()
    form.set('lastName', '')
    expect(() => validateIdentityNames(form)).toThrow()
  })
  test('rejects arbitrary non-image bytes, even with JPEG content type', async () => {
    const file = new File([new Uint8Array(1100)], 'fake.jpg', { type: 'image/jpeg' })
    expect(verifiedImage(file, 'selfie')).rejects.toThrow()
  })
  test('accepts real JPEG bytes with safe dimensions', async () => {
    const image = await sharp({ create: { width: 320, height: 320, channels: 3, background: '#aaaaaa' } }).jpeg().toBuffer()
    const accepted = await verifiedImage(new File([new Uint8Array(image)], 'photo.jpg', { type: 'image/jpeg' }), 'selfie')
    expect(accepted.length).toBeGreaterThan(512)
  })
})
