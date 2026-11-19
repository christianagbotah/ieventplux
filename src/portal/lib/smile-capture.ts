/** Translate Smile ID's documented SmartCameraWeb publish payload into the
 * multipart fields accepted by our server-side Smile ID Document Verification.
 * Keep all image bytes only in transient browser memory, never localStorage.
 * The provider—not iEventPlux—determines liveness and ID authenticity.
 */
export type SmileImage = { image_type_id: number; image: string }
export type SmileCameraPayload = { images?: SmileImage[]; meta?: { libraryVersion?: string } }
export type SmileVerifiedCapture = {
  selfieImage: File
  document: File
  documentBack?: File
  livenessImages: File[]
}

const SELFIE = 2
const ID_FRONT = 3
const LIVE = 6
const ID_BACK = 7
const MAX_SINGLE_BYTES = 3 * 1024 * 1024

function decodeImage(raw: string, name: string): File {
  if (typeof raw !== 'string') throw new Error('The camera returned an unreadable image. Retake the capture.')
  const text = raw.replace(/^data:image\/(?:jpeg|jpg|png);base64,/, '')
  if (text.length < 800 || text.length > Math.ceil(MAX_SINGLE_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw new Error('One of the camera images is missing or too large. Retake the capture.')
  }
  let binary: string
  try { binary = atob(text) } catch { throw new Error('The camera returned corrupted image data. Retake the capture.') }
  if (binary.length > MAX_SINGLE_BYTES) throw new Error('One of the images is too large to verify. Retake the capture.')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
  if (!jpeg && !png) throw new Error('The camera image has an invalid format. Please retake it.')
  return new File([bytes], name + (jpeg ? '.jpg' : '.png'), { type: jpeg ? 'image/jpeg' : 'image/png' })
}

export function smileCameraFiles(payload: unknown): SmileVerifiedCapture {
  if (!payload || typeof payload !== 'object' || !('images' in payload) || !Array.isArray(payload.images)) {
    throw new Error('The Smile ID camera did not return any verification images. Please retry.')
  }
  const images = payload.images as unknown[]
  if (images.length > 15) throw new Error('Too many images were returned by the camera. Please restart the verification.')
  const group = (type: number): string[] => images.filter((image) => image && typeof image === 'object' && (image as SmileImage).image_type_id === type).map((image) => (image as SmileImage).image)
  const front = group(ID_FRONT), back = group(ID_BACK), selfie = group(SELFIE), liveness = group(LIVE)
  if (front.length !== 1 || back.length > 1 || selfie.length !== 1 || liveness.length < 2 || liveness.length > 12) {
    throw new Error('The capture is incomplete. Retake the selfie, liveness sequence and front of your ID using the guided camera.')
  }
  return {
    selfieImage: decodeImage(selfie[0], 'selfie'),
    document: decodeImage(front[0], 'id-front'),
    ...(back.length ? { documentBack: decodeImage(back[0], 'id-back') } : {}),
    livenessImages: liveness.map((encoded, index) => decodeImage(encoded, `liveness-${index + 1}`)),
  }
}

export function smileFormData(capture: SmileVerifiedCapture, givenNames: string, lastName: string): FormData {
  const form = new FormData()
  form.set('givenNames', givenNames.trim())
  form.set('lastName', lastName.trim())
  form.set('biometricConsent', 'yes')
  form.append('selfieImage', capture.selfieImage)
  form.append('document', capture.document)
  if (capture.documentBack) form.append('documentBack', capture.documentBack)
  for (const image of capture.livenessImages) form.append('livenessImages', image)
  return form
}
