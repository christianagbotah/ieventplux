/** Isolated CI only: real HTTP multipart, image decoding and session ownership. */
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {unlink} from 'node:fs/promises'
import sharp from 'sharp'
import {db} from '../src/lib/db'
import {isPublicUploadName,mediaFilePath} from '../src/server/media-storage'
if(process.env.CI!=='true'||process.env.IEVENTPLUX_ISOLATED_DB_TEST!=='yes'||process.env.NODE_ENV==='production')throw new Error('Isolated CI only.')
const database=new URL(process.env.DATABASE_URL??'')
if(!['localhost','127.0.0.1'].includes(database.hostname)||database.port!=='5432'||database.pathname!=='/ieventplux')throw new Error('Unexpected DB.')
const base='http://127.0.0.1:3000',ids:string[]=[],files:string[]=[]
function check(condition:unknown,message:string){if(!condition)throw new Error(message);console.log('PASS '+message)}
async function actor(){const u=await db.user.create({data:{email:randomUUID()+'@example.invalid',displayName:'Synthetic profile',passwordHash:'synthetic'}});ids.push(u.id);const token=randomBytes(32).toString('hex');await db.session.create({data:{userId:u.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}});return {id:u.id,cookie:'ievx_session='+token}}
try{
 const owner=await actor(),other=await actor(),bytes=await sharp({create:{width:48,height:32,channels:3,background:'#087a6d'}}).png().toBuffer()
 async function upload(cookie:string|undefined,expected:string,purpose:string,data:Uint8Array=bytes){const form=new FormData();form.append('expectedUserId',expected);form.append('purpose',purpose);form.append('file',new Blob([Uint8Array.from(data)],{type:'image/png'}),'synthetic.png');const response=await fetch(base+'/api/v1/auth/branding',{method:'POST',headers:cookie?{Cookie:cookie}:{},body:form});const result=await response.json() as {url?:string};if(response.ok&&result.url?.startsWith('/uploads/')){const file=result.url.slice(9);if(isPublicUploadName(file))files.push(file)}return {status:response.status,url:result.url,headers:response.headers}}
 check((await upload(undefined,owner.id,'avatar')).status===401,'anonymous upload rejected')
 check((await upload(other.cookie,owner.id,'avatar')).status===409,'stale or different signed-in owner rejected')
 check((await upload(owner.cookie,owner.id,'avatar',new Uint8Array(20))).status===400,'spoofed PNG rejected')
 check((await upload(owner.cookie,owner.id,'other')).status===400,'unknown image purpose rejected')
 const avatar=await upload(owner.cookie,owner.id,'avatar'),banner=await upload(owner.cookie,owner.id,'banner')
 check(avatar.status===201&&banner.status===201&&avatar.url!==banner.url,'distinct owner images stored')
 check(avatar.headers.get('cache-control')?.includes('no-store'),'private mutation response not cached')
 for(const [item,width,height] of [[avatar,512,512],[banner,1600,600]] as const){const response=await fetch(base+item.url);check(response.status===200,'uploaded image publicly retrievable');const image=await sharp(Buffer.from(await response.arrayBuffer())).metadata();check(image.format==='webp'&&image.width===width&&image.height===height,'image normalized to expected WebP dimensions')}
 const profile=await fetch(base+'/api/v1/auth/profile',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify({expectedUserId:owner.id,displayName:'Updated synthetic profile',city:'Accra',bio:'QA profile biography'})});check(profile.status===200,'profile text update accepted')
 const me=await fetch(base+'/api/v1/auth/me',{headers:{Cookie:owner.cookie}}).then(r=>r.json()) as {user:{id:string;avatarUrl:string;bannerUrl:string;bio:string;city:string}};check(me.user.id===owner.id&&me.user.avatarUrl===avatar.url&&me.user.bannerUrl===banner.url&&me.user.bio==='QA profile biography'&&me.user.city==='Accra','session refresh exposes persisted fields and preserves images')
 const stranger=await db.user.findUniqueOrThrow({where:{id:other.id}});check(!stranger.avatarUrl&&!stranger.bannerUrl,'unrelated account unchanged')
 check(await db.auditLog.count({where:{actorUserId:owner.id,action:'user.profile.branding'}})===2,'exactly two successful uploads audited')
 console.log('PROFILE_BRANDING_SMOKE_PASS')
}finally{await db.auditLog.deleteMany({where:{actorUserId:{in:ids}}});await db.session.deleteMany({where:{userId:{in:ids}}});await db.user.deleteMany({where:{id:{in:ids}}});for(const f of files)await unlink(mediaFilePath(f)).catch(()=>{});await db.$disconnect()}
