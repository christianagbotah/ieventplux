import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from 'crypto'
import { mkdir, readFile, writeFile, unlink } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { env } from '@/server/env'
import { errors, sanitizeText } from '@/server/api'

export type KycKind = 'BUSINESS_REGISTRATION' | 'GOVERNMENT_ID' | 'SELFIE'
export interface KycDocument {
  type: 'kyc'
  id: string
  kind: KycKind
  filename: string
  mime: string
  size: number
  uploadedAt: string
  uploadedBy: string
}
export interface KycNote { type: 'notes'; ref: string; at?: string }
export type VerificationEvidence = KycDocument | KycNote

export function parseEvidence(value: string | null | undefined): VerificationEvidence[] {
  try {
    const records = JSON.parse(value || '[]')
    return Array.isArray(records) ? records.filter((v) => v && typeof v === 'object') as VerificationEvidence[] : []
  } catch { return [] }
}
function storageRoot() {
  const dir = process.env.KYC_PRIVATE_DIR || (process.env.NODE_ENV === 'production' ? '' : path.join(process.cwd(), '.private', 'kyc'))
  if (!dir || !path.isAbsolute(dir)) throw errors.unavailable('KYC_NOT_CONFIGURED', 'Private verification storage is not configured.')
  if (dir.startsWith(path.join(process.cwd(), 'public') + path.sep)) throw errors.unavailable('KYC_STORAGE_INSECURE', 'Verification storage must not be public.')
  return dir
}
function key() {
  return Buffer.from(hkdfSync('sha256', Buffer.from(env.appSecret), Buffer.from('ieventplux-kyc-v1'), Buffer.from('document-encryption'), 32))
}
export function privateDocumentPath(orgId: string, documentId: string) {
  if (!/^[a-z0-9_-]{8,80}$/i.test(orgId) || !/^[a-f0-9-]{36}$/i.test(documentId)) throw errors.badRequest('Invalid document identifier.')
  return path.join(storageRoot(), orgId, documentId + '.enc')
}
export function newDocumentId() { return randomUUID() }

export async function prepareKycFile(file: File, kind: KycKind): Promise<{ buffer: Buffer; mime: string }> {
  if (file.size === 0 || file.size > 8 * 1024 * 1024) throw errors.badRequest('Document must be between 1 byte and 8 MB.')
  const raw = Buffer.from(await file.arrayBuffer())
  if (file.type === 'application/pdf' && kind !== 'SELFIE') {
    if (raw.subarray(0, 5).toString('ascii') !== '%PDF-') throw errors.badRequest('Invalid PDF document.')
    return { buffer: raw, mime: 'application/pdf' }
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw errors.badRequest('Upload a PNG, JPEG, WebP or PDF document. Selfies must be images.')
  try {
    const metadata = await sharp(raw, { limitInputPixels: 18_000_000 }).metadata()
    if (!metadata.width || !metadata.height || metadata.width < 200 || metadata.height < 200) throw new Error('Image resolution too small')
    return { buffer: await sharp(raw).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(), mime: 'image/webp' }
  } catch { throw errors.badRequest('Invalid or unreadable image. Upload a clear photo.') }
}
export async function saveEncryptedKyc(orgId: string, id: string, payload: Buffer) {
  const filepath = privateDocumentPath(orgId, id)
  await mkdir(path.dirname(filepath), { recursive: true, mode: 0o700 })
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()])
  await writeFile(filepath, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { flag: 'wx', mode: 0o600 })
}
export async function readEncryptedKyc(orgId: string, id: string) {
  const content = await readFile(privateDocumentPath(orgId, id))
  if (content.length < 29) throw errors.notFound('Document unavailable.')
  const decipher = createDecipheriv('aes-256-gcm', key(), content.subarray(0, 12))
  decipher.setAuthTag(content.subarray(12, 28))
  return Buffer.concat([decipher.update(content.subarray(28)), decipher.final()])
}
export async function deleteKycFile(orgId: string, id: string) {
  await unlink(privateDocumentPath(orgId, id)).catch(() => {})
}
export function kycMetadata(document: KycDocument) {
  return { id: document.id, kind: document.kind, filename: document.filename, mime: document.mime, size: document.size, uploadedAt: document.uploadedAt }
}
export function validKycKind(value: unknown): KycKind {
  if (value === 'BUSINESS_REGISTRATION' || value === 'GOVERNMENT_ID' || value === 'SELFIE') return value
  throw errors.badRequest('Choose registration documents, government ID, or selfie.')
}
export function safeFileLabel(value: unknown): string {
  return sanitizeText(value, 100).replace(/[\/\\<>]/g, '') || 'Verification document'
}
