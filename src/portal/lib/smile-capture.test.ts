import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'
import { smileCameraFiles, smileFormData } from './smile-capture'

async function sampleImage() {
  const bytes = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#b0b0b0' } }).jpeg().toBuffer()
  return bytes.toString('base64')
}

describe('Smile ID SmartCameraWeb payload translation', () => {
  test('maps provider image types to server multipart fields with no raw data URIs', async () => {
    const photo = await sampleImage()
    const payload = { images: [
      { image_type_id: 2, image: photo },
      { image_type_id: 3, image: photo },
      { image_type_id: 7, image: photo },
      ...Array.from({ length: 4 }, () => ({ image_type_id: 6, image: photo })),
    ] }
    const capture = smileCameraFiles(payload)
    expect(capture.selfieImage.type).toBe('image/jpeg')
    expect(capture.documentBack?.type).toBe('image/jpeg')
    expect(capture.livenessImages).toHaveLength(4)
    const form = smileFormData(capture, ' Ama ', ' Boateng ')
    expect(form.get('biometricConsent')).toBe('yes')
    expect(form.get('givenNames')).toBe('Ama')
    expect(form.get('lastName')).toBe('Boateng')
    expect(form.getAll('livenessImages')).toHaveLength(4)
    expect(form.get('document')).toBeInstanceOf(File)
  })
  test('rejects fake/incomplete capture even when images have valid content', async () => {
    const photo = await sampleImage()
    expect(() => smileCameraFiles({ images: [] })).toThrow()
    expect(() => smileCameraFiles({ images: [{ image_type_id: 2, image: photo }, { image_type_id: 3, image: photo }] })).toThrow()
    expect(() => smileCameraFiles({ images: [{ image_type_id: 2, image: photo }, { image_type_id: 3, image: photo }, ...Array(13).fill({ image_type_id: 6, image: photo })] })).toThrow()
    expect(() => smileCameraFiles({ images: [{ image_type_id: 2, image: 'not-valid-base64' }, { image_type_id: 3, image: photo }, ...Array(3).fill({ image_type_id: 6, image: photo })] })).toThrow()
  })
  test('accepts a single-sided document capture and keeps sensitive images in memory only', async () => {
    const photo = await sampleImage()
    const files = smileCameraFiles({ images: [{ image_type_id: 2, image: photo }, { image_type_id: 3, image: photo }, ...Array(2).fill({ image_type_id: 6, image: photo })] })
    expect(files.documentBack).toBeUndefined()
    const form = smileFormData(files, 'Kwame', 'Mensah')
    expect(form.get('documentBack')).toBeNull()
  })
})
