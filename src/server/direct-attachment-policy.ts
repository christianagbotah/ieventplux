import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto'
export const MAX_DIRECT_FILE=2*1024*1024
export const MAX_DIRECT_MULTIPART=MAX_DIRECT_FILE+32*1024
export const MAX_DIRECT_USER_BYTES=50*1024*1024
export const MAX_DIRECT_GLOBAL_BYTES=256*1024*1024
export function attachmentKey(env:Record<string,string|undefined>):Buffer|null{
 const value=env.IEVENTPLUX_DIRECT_ATTACHMENT_KEY
 return typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value)?Buffer.from(value,'hex'):null
}
export function attachmentsEnabled(env:Record<string,string|undefined>){
 return env.IEVENTPLUX_DIRECT_ATTACHMENTS_ENABLED==='true'&&!!attachmentKey(env)
}
export function safeAttachmentName(raw:string,mime:string){
 const stem=raw.normalize('NFKC').replace(/[^a-zA-Z0-9._ -]/g,'_').replace(/^[. ]+/,'').replace(/\.[^.]*$/,'').trim().slice(0,85)||'Attachment'
 return stem+(mime==='application/pdf'?'.pdf':mime==='audio/mp4'?'.m4a':mime==='audio/webm'?'.webm':'.webp')
}
export function pdfSignature(bytes:Buffer){
 return bytes.subarray(0,5).toString('ascii')==='%PDF-'&&bytes.subarray(-1024).includes(Buffer.from('%%EOF'))
}
export function digestAttachment(bytes:Buffer){return createHash('sha256').update(bytes).digest('hex')}
export function encryptAttachment(bytes:Buffer,key:Buffer,aad:string){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv)
 cipher.setAAD(Buffer.from(aad))
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()])
 return Buffer.concat([iv,cipher.getAuthTag(),ciphertext])
}
export function decryptAttachment(payload:Uint8Array,key:Buffer,aad:string){
 const bytes=Buffer.from(payload)
 if(bytes.length<29||bytes.length>MAX_DIRECT_FILE+28)throw new Error('Invalid encrypted attachment.')
 const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12))
 cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(bytes.subarray(12,28))
 return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()])
}

// Container checks are not a codec parser or malware scanner. The server size
// limit applies independently of the recorder's local time limit.
export function voiceMime(mime:string):'audio/mp4'|'audio/webm'|null{
 const base=mime.toLowerCase().split(';')[0].trim()
 return base==='audio/mp4'||base==='audio/m4a'||base==='audio/x-m4a'?'audio/mp4':base==='audio/webm'?'audio/webm':null
}
export function voiceSignature(bytes:Buffer,mime:string){
 if(bytes.length<32||bytes.length>MAX_DIRECT_FILE)return false
 if(mime==='audio/webm')return bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))&&bytes.subarray(0,4096).includes(Buffer.from('webm'))&&bytes.includes(Buffer.from('A_OPUS'))
 if(mime!=='audio/mp4')return false
 let offset=0,ftyp=false,mdat=false,moov=false
 while(offset+8<=bytes.length){
  const size=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8)
  if(size<8||offset+size>bytes.length)return false
  if(type==='ftyp'&&offset===0&&size>=16)ftyp=true
  if(type==='mdat'&&size>8)mdat=true
  if(type==='moov'&&size>8)moov=true
  offset+=size
 }
 return offset===bytes.length&&ftyp&&mdat&&moov&&bytes.includes(Buffer.from('mp4a'))
}
