/// <reference types="bun-types" />
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {
  deleteKycFile, newDocumentId, parseEvidence, prepareKycFile,
  privateDocumentPath, readEncryptedKyc, safeFileLabel, saveEncryptedKyc,
} from './kyc-storage'

const ORG = 'synthetic-test-organization'
let directory = ''

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'ieventplux-kyc-unit-'))
  process.env.KYC_PRIVATE_DIR = directory
})
afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
  delete process.env.KYC_PRIVATE_DIR
})

describe('encrypted verification documents', () => {
  test('AES-GCM roundtrip stores no plaintext on disk', async () => {
    const id = newDocumentId()
    const cleartext = Buffer.from('SYNTHETIC DATA FOR SECURITY TEST — NOT A REAL ID')
    try {
      await saveEncryptedKyc(ORG, id, cleartext)
      const stored = await readFile(privateDocumentPath(ORG, id))
      expect(stored.includes(cleartext)).toBe(false)
      expect(stored.equals(cleartext)).toBe(false)
      expect(await readEncryptedKyc(ORG, id)).toEqual(cleartext)
    } finally {
      await deleteKycFile(ORG, id)
    }
  })
  test('modification of ciphertext is detected and rejected', async () => {
    const id = newDocumentId()
    try {
      await saveEncryptedKyc(ORG, id, Buffer.from('synthetic data'))
      const filepath = privateDocumentPath(ORG, id)
      const tampered = await readFile(filepath)
      tampered[tampered.length - 1] ^= 0x01
      await writeFile(filepath, tampered)
      await expect(readEncryptedKyc(ORG, id)).rejects.toThrow()
    } finally {
      await deleteKycFile(ORG, id)
    }
  })
  test('path traversal and malformed document ids are rejected', () => {
    const id = newDocumentId()
    expect(() => privateDocumentPath('../public', id)).toThrow()
    expect(() => privateDocumentPath(ORG, '../../data')).toThrow()
    expect(() => privateDocumentPath('x', id)).toThrow()
  })
})

describe('upload validation and sanitization', () => {
  test('fake PDF and PDF selfie are rejected', async () => {
    const fake = new File(['not a pdf'], 'fake.pdf', { type: 'application/pdf' })
    await expect(prepareKycFile(fake, 'GOVERNMENT_ID')).rejects.toThrow()
    await expect(prepareKycFile(fake, 'SELFIE')).rejects.toThrow()
  })
  test('images become bounded WebP without source metadata', async () => {
    const png = await sharp({ create: { width: 480, height: 300, channels: 3, background: '#aaaaaa' } }).png().toBuffer()
    const file = new File([Uint8Array.from(png)], 'example.png', { type: 'image/png' })
    const out = await prepareKycFile(file, 'SELFIE')
    expect(out.mime).toBe('image/webp')
    expect(out.buffer.length).toBeGreaterThan(0)
    const metadata = await sharp(out.buffer).metadata()
    expect(metadata.format).toBe('webp')
    expect(metadata.width).toBe(480)
    expect(metadata.height).toBe(300)
  })
  test('oversized files are rejected before conversion', async () => {
    const fake = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    await expect(prepareKycFile(fake, 'GOVERNMENT_ID')).rejects.toThrow()
  })
  test('file label excludes path characters and markup delimiters', () => {
    const result = safeFileLabel('../<passport>\\card.png')
    expect(result).not.toContain('/')
    expect(result).not.toContain('\\')
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
  })
  test('malformed evidence JSON is treated as empty, not trusted', () => {
    expect(parseEvidence('not-json')).toEqual([])
    expect(parseEvidence('{}')).toEqual([])
  })
})
