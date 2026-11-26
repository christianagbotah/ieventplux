import {expect,test} from 'bun:test'
import {attachmentsEnabled,attachmentKey,safeAttachmentName,pdfSignature,digestAttachment,encryptAttachment,decryptAttachment,MAX_DIRECT_FILE,voiceMime,voiceSignature} from './direct-attachment-policy'
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

test('voice container allowlist and byte bounds',()=>{
 const box=(type:string,content:Buffer)=>{
  const header=Buffer.alloc(8);header.writeUInt32BE(content.length+8);header.write(type,4,'ascii')
  return Buffer.concat([header,content])
 }
 const mp4=Buffer.concat([box('ftyp',Buffer.from('M4A '+String.fromCharCode(0,0,0,0))),box('mdat',Buffer.from('synthetic audio bytes')),box('moov',Buffer.from('mp4a'))])
 const webm=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.from('webm A_OPUS synthetic test container data')])
 expect(voiceMime('audio/webm;codecs=opus')).toBe('audio/webm')
 expect(voiceMime('audio/x-m4a')).toBe('audio/mp4')
 expect(voiceMime('video/mp4')).toBeNull()
 expect(voiceSignature(mp4,'audio/mp4')).toBe(true)
 expect(voiceSignature(webm,'audio/webm')).toBe(true)
 expect(voiceSignature(Buffer.from('not voice audio'),'audio/webm')).toBe(false)
 expect(voiceSignature(mp4.subarray(0,-1),'audio/mp4')).toBe(false)
 expect(voiceSignature(Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.from('webm V_VP8 synthetic test container data')]),'audio/webm')).toBe(false)
 expect(safeAttachmentName('Voice message','audio/mp4')).toBe('Voice message.m4a')
 expect(safeAttachmentName('Voice message','audio/webm')).toBe('Voice message.webm')
})
