import {expect,test} from 'bun:test'
import {attachmentsEnabled,attachmentKey,safeAttachmentName,pdfSignature,digestAttachment,encryptAttachment,decryptAttachment,MAX_DIRECT_FILE} from './direct-attachment-policy'
const key=Buffer.alloc(32,17)
test('upload requires a dedicated encryption key and explicit enablement',()=>{
 expect(attachmentsEnabled({})).toBe(false)
 expect(attachmentsEnabled({IEVENTPLUX_DIRECT_ATTACHMENTS_ENABLED:'true',IEVENTPLUX_DIRECT_ATTACHMENT_KEY:'placeholder'})).toBe(false)
 expect(attachmentsEnabled({IEVENTPLUX_DIRECT_ATTACHMENTS_ENABLED:'true',IEVENTPLUX_DIRECT_ATTACHMENT_KEY:key.toString('hex')})).toBe(true)
 expect(attachmentKey({IEVENTPLUX_DIRECT_ATTACHMENT_KEY:'a'.repeat(63)})).toBeNull()
})
test('encrypted bytes bind to message identity, tampering cannot be decrypted',()=>{
 const bytes=Buffer.from('private synthetic attachment')
 const ciphertext=encryptAttachment(bytes,key,'message-a')
 expect(ciphertext.length).toBe(bytes.length+28)
 expect(ciphertext.includes(bytes)).toBe(false)
 expect(decryptAttachment(ciphertext,key,'message-a')).toEqual(bytes)
 expect(()=>decryptAttachment(ciphertext,key,'message-b')).toThrow()
 ciphertext[ciphertext.length-1]^=1
 expect(()=>decryptAttachment(ciphertext,key,'message-a')).toThrow()
 expect(digestAttachment(bytes)).toHaveLength(64)
})
test('file labels never become paths or response header injection',()=>{
 const label=safeAttachmentName('../test"\r\n.pdf','image/webp')
 expect(label.endsWith('.webp')).toBe(true)
 expect(label).not.toMatch(/[\/\r\n"]/)
 expect(safeAttachmentName('a'.repeat(500),'application/pdf').length).toBeLessThanOrEqual(100)
 expect(pdfSignature(Buffer.from('%PDF-1.4\n%%EOF'))).toBe(true)
 expect(pdfSignature(Buffer.from('%PDF-1.4 missing trailer'))).toBe(false)
 expect(MAX_DIRECT_FILE).toBe(2097152)
})
