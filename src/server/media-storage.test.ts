import { describe, expect, test } from 'bun:test'
import { isPublicUploadName, mimeForUploadName, isSupportedImage } from './media-storage'

const uuid = '2ea0a9a3-ca01-4870-85c3-95ab71cb540d'

describe('persistent public image storage', () => {
  test('accepts immutable UUID-based poster filenames only', () => {
    expect(isPublicUploadName(`${uuid}.jpg`)).toBe(true)
    expect(mimeForUploadName(`${uuid}.webp`)).toBe('image/webp')
    for (const value of ['../../secret.jpg', 'example.jpg', `${uuid}.svg`, `${uuid}.jpg/../../secret`, '']) {
      expect(isPublicUploadName(value)).toBe(false)
      expect(mimeForUploadName(value)).toBeNull()
    }
  })
  test('rejects fake or empty client image payloads', () => {
    expect(isSupportedImage(new Uint8Array(), 'image/png')).toBe(false)
    expect(isSupportedImage(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]), 'image/jpeg')).toBe(false)
    expect(isSupportedImage(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]), 'image/png')).toBe(true)
    expect(isSupportedImage(new Uint8Array([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'image/jpeg')).toBe(true)
    expect(isSupportedImage(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]), 'image/webp')).toBe(true)
  })
})
