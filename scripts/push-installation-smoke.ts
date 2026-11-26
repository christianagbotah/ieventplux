import { randomBytes, createHash } from 'node:crypto'
import { db } from '../src/lib/db'
if(process.env.CI!=='true'||process.env.NODE_ENV==='production'||process.env.IEVENTPLUX_ISOLATED_DB_TEST!=='yes')throw new Error('Isolated CI only.')
const url=new URL(process.env.DATABASE_URL??'')
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='5432'||url.pathname!=='/ieventplux')throw new Error('Unexpected test database.')
const base='http://127.0.0.1:3000/api/v1'
const check=(v:unknown,label:string)=>{if(!v)throw new Error(label);console.log('PASS '+label)}
const key=()=>randomBytes(32).toString('base64url')
const hash=(v:string)=>createHash('sha256').update(v).digest('hex')
const make=async()=>{
 const user=await db.user.create({data:{email:key()+'@example.invalid',displayName:'Synthetic push user',passwordHash:'synthetic',notifPrefs:'{"push":true}'}})
 const token=key()
 const session=await db.session.create({data:{userId:user.id,tokenHash:hash(token),expiresAt:new Date(Date.now()+600000)}})
 return {user,session,cookie:'ievx_session='+token}
}
async function main(){
 const a=await make(),b=await make()
 const installationKey=key(),providerToken='ExpoPushToken['+key()+']'
 const data={installationKey,providerToken,platform:'ANDROID',permissionGranted:true}
 const call=async(method:string,body:object,cookie?:string,path='/notifications/devices')=>{
  const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({expectedUserId:cookie===a.cookie?a.user.id:cookie===b.cookie?b.user.id:undefined,...body})})
  return {status:res.status,headers:res.headers,body:await res.json()}
 }
 try{
  check((await call('POST',data)).status===401,'anonymous registration denied')
  check((await call('POST',{...data,permissionGranted:false},a.cookie)).status===400,'permission must be granted')
  check((await call('POST',{...data,expectedUserId:b.user.id},a.cookie)).status===409,'stale client cannot register against a different authenticated account')
  const registered=await call('POST',data,a.cookie)
  check(registered.status===200&&registered.body.registered&&registered.body.deliveryEnabled===false&&!JSON.stringify(registered.body).includes(providerToken)&&registered.headers.get('cache-control')?.includes('no-store'),'private registration, no delivery claim or token exposure')
  check((await call('POST',data,a.cookie)).status===200,'same installation idempotent')
  check(await db.pushInstallation.count({where:{sessionId:a.session.id}})===1,'one registered installation')
  check((await call('POST',{...data,installationKey:key()},b.cookie)).status===409,'foreign key cannot claim another provider token')
  await call('DELETE',{installationKey},b.cookie)
  check(!(await db.pushInstallation.findUniqueOrThrow({where:{keyHash:hash(installationKey)}})).revokedAt,'foreign session cannot revoke installation')
  const rotated={...data,providerToken:'ExponentPushToken['+key()+']'}
  check((await call('POST',rotated,a.cookie)).status===200,'same installation rotates provider token')
  check((await call('POST',rotated,b.cookie)).status===200,'installation capability rebinds same phone to signed-in account')
  let row=await db.pushInstallation.findUniqueOrThrow({where:{keyHash:hash(installationKey)}})
  check(row.sessionId===b.session.id&&row.providerToken===rotated.providerToken,'registration belongs to new session only')
  await call('DELETE',{installationKey},a.cookie)
  check(!(await db.pushInstallation.findUniqueOrThrow({where:{keyHash:hash(installationKey)}})).revokedAt,'old session cannot revoke new owner')
  check((await call('DELETE',{installationKey},b.cookie)).status===200,'current session revocation succeeds')
  row=await db.pushInstallation.findUniqueOrThrow({where:{keyHash:hash(installationKey)}})
  check(!!row.revokedAt,'revocation persisted')
  check((await call('POST',rotated,b.cookie)).status===200,'explicit permission can reactivate registration')
  await db.session.update({where:{id:b.session.id},data:{revokedAt:new Date()}})
  check((await call('POST',rotated,b.cookie)).status===401,'revoked login cannot register')
  check(await db.pushInstallation.count({where:{keyHash:hash(installationKey),revokedAt:null,session:{revokedAt:null,expiresAt:{gt:new Date()}}}})===0,'revoked session excluded by delivery eligibility')
  await db.user.update({where:{id:a.user.id},data:{notifPrefs:'{"push":false}'}})
  check((await call('POST',{...data,installationKey:key(),providerToken:'ExpoPushToken['+key()+']'},a.cookie)).status===403,'opt-out cannot register')
  console.log('PUSH_INSTALLATION_SMOKE_PASS')
 }finally{await db.user.deleteMany({where:{id:{in:[a.user.id,b.user.id]}}})}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Push test failed');process.exitCode=1}).finally(()=>db.$disconnect())
