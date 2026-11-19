import sharp from 'sharp'
import { errors } from '@/server/api'

/** Validate capture file sizes and decoding without storing biometric bytes in our database.
 * Actual liveness is scored by the provider, not by heuristics in iEventPlux.
 */
export async function verifiedImage(value: FormDataEntryValue | null, field: string): Promise<Buffer> {
  if (!(value instanceof File)) throw errors.badRequest(`Take or select the ${field} image using the verification camera.`)
  if (!['image/jpeg', 'image/png'].includes(value.type) || value.size < 512 || value.size > 3 * 1024 * 1024) {
    throw errors.badRequest(`${field} must be a JPEG or PNG image of up to 3 MB.`)
  }
  const bytes = Buffer.from(await value.arrayBuffer())
  try {
    const info = await sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'error' }).metadata()
    if (!info.width || !info.height || info.width < 200 || info.height < 200) throw new Error('Image too small')
    if (info.format !== 'jpeg' && info.format !== 'png') throw new Error('Wrong encoding')
  } catch { throw errors.badRequest(`${field} is not a readable photograph. Retake it with the camera.`) }
  return bytes
}

export function validateIdentityNames(form: FormData): { givenNames: string; lastName: string } {
  const givenNames = String(form.get('givenNames') ?? '').trim()
  const lastName = String(form.get('lastName') ?? '').trim()
  if (!givenNames || !lastName || givenNames.length > 80 || lastName.length > 80 || /[<>\u0000-\u001f]/.test(givenNames + lastName)) {
    throw errors.badRequest('Provide your legal given name(s) and surname exactly as shown on your ID.')
  }
  return { givenNames, lastName }
}

export function validateLivenessFiles(values: FormDataEntryValue[]): void {
  if (values.length !== 6) throw errors.badRequest('Six guided liveness captures from the provider camera are required before starting verification.')
  if (values.some((v) => !(v instanceof File) || v.size > 3 * 1024 * 1024)) {
    throw errors.badRequest('A liveness capture is missing or too large. Please retry the camera challenge.')
  }
}
