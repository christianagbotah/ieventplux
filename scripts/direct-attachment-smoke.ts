import {randomBytes,createHash} from 'node:crypto'
import sharp from 'sharp'
import {db} from '../src/lib/db'
if(process.env.CI!=='true'||process.env.NODE_ENV==='production'||process.env.IEVENTPLUX_ISOLATED_DB_TEST!=='yes')throw new Error('Isolated CI only.')
const url=new URL(process.env.DATABASE_URL??'')
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='5432'||url.pathname!=='/ieventplux')throw new Error('Unexpected test database.')
const key=()=>randomBytes(24).toString('hex')
const check=(v:unknown,label:string)=>{if(!v)throw new Error(label);console.log('PASS '+label)}
const users:string[]=[]
const base='http://127.0.0.1:3000/api/v1'
type Actor={id:string;cookie:string}
async function make(role='USER'){
 const user=await db.user.create({data:{email:key()+'@example.invalid',displayName:'Synthetic attachment contact',passwordHash:'synthetic',role}})
 users.push(user.id)
 const token=key()
 await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}})
 return {id:user.id,cookie:'ievx_session='+token}
}
const headers=(actor:Actor|null)=>({'x-forwarded-for':'192.0.2.97',...(actor?{Cookie:actor.cookie}:{})})
async function action(actor:Actor,body:object){
 const res=await fetch(base+'/direct-messages',{method:'POST',headers:{...headers(actor),'Content-Type':'application/json'},body:JSON.stringify({expectedUserId:actor.id,...body})})
 return {status:res.status,data:await res.json()}
}
async function upload(actor:Actor,id:string,file:File,clientKey=key(),caption='',expectedUserId=actor.id){
 const form=new FormData()
 form.append('id',id);form.append('expectedUserId',expectedUserId);form.append('caption',caption);form.append('clientKey',clientKey);form.append('file',file)
 const res=await fetch(base+'/direct-messages/attachments',{method:'POST',headers:headers(actor),body:form})
 return {status:res.status,data:await res.json()}
}
const download=(actor:Actor|null,messageId:string,encoding='',expectedUserId=actor?.id??'')=>fetch(base+'/direct-messages/attachments?messageId='+encodeURIComponent(messageId)+'&expectedUserId='+encodeURIComponent(expectedUserId)+(encoding?'&encoding='+encoding:''),{headers:headers(actor)})
async function main(){
 try{
  const a=await make(),b=await make(),c=await make(),moderator=await make('MODERATOR'),finance=await make('FINANCE_ADMIN')
  const config=await fetch(base+'/direct-messages/attachments',{headers:headers(a)})
  check((await config.json()).enabled===true,'CI enables attachments using synthetic key only')
  const png=await sharp({create:{width:30,height:30,channels:3,background:'#345678'}}).png().toBuffer()
  const image=new File([new Uint8Array(png)],'private-picture.png',{type:'image/png'})
  const id=(await action(a,{action:'request',userId:b.id})).data.conversation.id
  check((await upload(a,id,image)).status===403,'pending contact cannot upload')
  await action(b,{action:'accept',id})
  check((await upload(c,id,image)).status===404,'outsider cannot upload into another chat')
  check((await upload(a,id,image,key(),'',c.id)).status===409,'stale account attachment send denied')
  check((await upload(a,id,new File(['<html>spoof</html>'],'fake.png',{type:'image/png'}))).status===400,'forged image rejected')
  check((await upload(a,id,new File(['not a PDF'],'fake.pdf',{type:'application/pdf'}))).status===400,'forged PDF rejected')
  check((await upload(a,id,new File([new Uint8Array(2097153)],'large.png',{type:'image/png'}))).status===400,'oversized file rejected')
  const clientKey=key()
  const sent=await upload(a,id,image,clientKey,'Photo')
  check(sent.status===200&&sent.data.message.attachment.mime==='image/webp','image normalized and private message committed')
  const messageId=sent.data.message.id
  const stored=await db.directAttachment.findUniqueOrThrow({where:{messageId}})
  check(stored.payload.length===stored.size+28,'stored payload authenticated-encrypted')
  check(!JSON.stringify(sent.data).includes('payload')&&!JSON.stringify(sent.data).includes('digest'),'send returns only attachment metadata')
  check((await upload(a,id,image,clientKey,'Photo')).data.replayed===true,'same attachment retry deduplicated')
  check(await db.directAttachment.count({where:{messageId}})===1,'no duplicate binary object')
  check((await action(a,{action:'send',id,clientKey,body:'Photo'})).status===409,'text cannot reuse attachment key')
  check((await download(c,messageId)).status===404,'outsider cannot download attachment')
  check((await download(null,messageId)).status===401,'anonymous attachment denied')
  check((await download(b,messageId,'',a.id)).status===409,'stale download account denied')
  const response=await download(b,messageId)
  check(response.ok&&response.headers.get('cache-control')?.includes('no-store')&&response.headers.get('content-disposition')?.startsWith('attachment;'),'private forced download')
  const bytes=Buffer.from(await response.arrayBuffer())
  check(bytes.length===stored.size&&!Buffer.from(stored.payload).includes(bytes),'download decrypted; database does not store plaintext')
  const mobile=await download(a,messageId,'base64')
  check(Buffer.from((await mobile.json()).base64,'base64').equals(bytes),'native authenticated bytes match web download')
  const pdf=new File(['%PDF-1.4\nSynthetic PDF test\n%%EOF'],'document.pdf',{type:'application/pdf'})
  const doc=await upload(b,id,pdf)
  check(doc.status===200&&doc.data.message.attachment.mime==='application/pdf','PDF stored as download-only')
  check((await download(a,doc.data.message.id)).headers.get('content-type')==='application/pdf','PDF correct media type')
  const report=await action(b,{action:'report',id,messageId,reason:'OFFENSIVE'})
  check(report.data.reported===true,'recipient reports attachment message')
  const row=await db.moderationReport.findFirstOrThrow({where:{reporterId:b.id,targetId:messageId,targetType:'DIRECT_MESSAGE'}})
  const evidence=(actor:Actor)=>fetch(base+'/admin/moderation/'+row.id+'/attachment',{headers:headers(actor)})
  check((await evidence(finance)).status===403,'finance role denied private reported attachment')
  check((await evidence(moderator)).ok,'authorized moderator downloads only reported attachment')
  check(await db.auditLog.count({where:{entityId:row.id,action:'moderation.direct_message.attachment'}})===1,'moderation attachment access audited')
  const removal=await fetch(base+'/admin/moderation/'+row.id+'/action',{method:'POST',headers:{...headers(moderator),'Content-Type':'application/json'},body:JSON.stringify({action:'REMOVE_CONTENT'})})
  check(removal.ok,'moderator removes reported attachment')
  check(await db.directAttachment.count({where:{messageId}})===0,'removed encrypted payload deleted')
  check((await download(b,messageId)).status===404,'removed file no longer retrievable')
  check((await evidence(moderator)).status===404,'closed case cannot download file')
  check((await action(b,{action:'safety',id,kind:'block',enabled:true})).status===200,'block activated')
  check((await upload(a,id,image)).status===403,'blocked sender cannot upload')
  console.log('DIRECT_ATTACHMENT_SMOKE_PASS')
 }finally{
  await db.moderationReport.deleteMany({where:{reporterId:{in:users},targetType:'DIRECT_MESSAGE'}})
  await db.user.deleteMany({where:{id:{in:users}}})
 }
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Attachment smoke failed');process.exitCode=1}).finally(()=>db.$disconnect())
