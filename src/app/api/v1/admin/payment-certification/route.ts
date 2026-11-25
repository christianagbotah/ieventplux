import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,requirePlatformRole,requireElevated,rateLimit,readJson,errors} from '@/server/api'
import {sandboxTransportKey} from '@/server/platform-paystack-transport'
import {recordPlannedPaymentIntent} from '@/server/services/platform-payment-intents'
import {initializePreparedSandboxCheckout,reconcilePreparedSandboxCollection} from '@/server/services/platform-sandbox-connectivity'
import {parseCertificationAction,certificationIdentity,splitCertificationIdentity,CERTIFICATION_PRICE_VERSION,CERTIFICATION_AMOUNT_MINOR,SPLIT_CERTIFICATION_PRICE_VERSION,SPLIT_CERTIFICATION_AMOUNT_MINOR,SPLIT_CERTIFICATION_COMMISSION_MINOR} from '@/server/payment-certification-policy'
function enabled(){try{sandboxTransportKey(process.env);return true}catch{return false}}
async function eligibleRecipients(){
 const [stores,orgs,claims]=await Promise.all([
  db.marketplaceSettlementOnboarding.findMany({where:{state:'SANDBOX_VERIFIED',store:{status:'ACTIVE',country:'GH',deletedAt:null}},select:{storeId:true,requestedBy:true,testSubaccountCode:true,store:{select:{name:true,ownerId:true}}},take:200}),
  db.organizationSettlementOnboarding.findMany({where:{state:'SANDBOX_VERIFIED',org:{status:'ACTIVE',country:'GH',deletedAt:null,verifiedAt:{not:null},verification:{status:'APPROVED'}}},select:{orgId:true,requestedBy:true,testSubaccountCode:true,org:{select:{name:true,ownerId:true}}},take:200}),
  db.sandboxSettlementClaim.findMany({select:{code:true,beneficiaryKind:true,beneficiaryId:true}})
 ])
 const matches=(kind:string,id:string,code:string|null)=>claims.some(c=>c.beneficiaryKind===kind&&c.beneficiaryId===id&&c.code===code)
 return [...stores.filter(s=>s.requestedBy===s.store.ownerId&&matches('STORE',s.storeId,s.testSubaccountCode)).map(s=>({kind:'STORE' as const,id:s.storeId,name:s.store.name})),...orgs.filter(o=>o.requestedBy===o.org.ownerId&&matches('ORGANIZATION',o.orgId,o.testSubaccountCode)).map(o=>({kind:'ORGANIZATION' as const,id:o.orgId,name:o.org.name}))]
}
export async function GET(){
 return handle(async()=>{
  const user=await requirePlatformRole('admin:finance')
  const [items,recipients]=await Promise.all([
   db.platformPaymentIntent.findMany({where:{pricingVersion:{in:[CERTIFICATION_PRICE_VERSION,SPLIT_CERTIFICATION_PRICE_VERSION]},sourceId:{startsWith:'cert:'+user.id+':'},reference:{startsWith:'TEST-'}},orderBy:{createdAt:'desc'},take:20,select:{reference:true,createdAt:true,beneficiaryKind:true,totalMinor:true,platformGrossMinor:true,beneficiaryGrossMinor:true,sandboxAttempt:{select:{checkout:{select:{status:true}},collectionEvidence:{select:{allocation:true,verifiedAt:true}}}}}}),
   eligibleRecipients()
  ])
  return jsonOk({enabled:enabled(),amountMinor:CERTIFICATION_AMOUNT_MINOR,splitAmountMinor:SPLIT_CERTIFICATION_AMOUNT_MINOR,splitCommissionMinor:SPLIT_CERTIFICATION_COMMISSION_MINOR,items,recipients,liveEnabled:false})
 })
}
export async function POST(req:NextRequest){
 return handle(async()=>{
  await requirePlatformRole('admin:finance')
  const user=await requireElevated()
  await rateLimit(req,'payment-certification',5,60000)
  if(!enabled())throw errors.forbidden('Sandbox certification is not configured.')
  let input
  try{input=parseCertificationAction(await readJson(req))}catch{throw errors.badRequest('A valid test-only case and explicit confirmation are required.')}
  const account=await db.user.findUnique({where:{id:user.id},select:{email:true,emailVerifiedAt:true,status:true}})
  if(!account?.emailVerifiedAt||account.status!=='ACTIVE')throw errors.forbidden('Verified active finance account required.')
  const direct=certificationIdentity(user.id,input.caseId)
  const purpose=input.mode==='DIRECT'?direct.purpose:input.mode==='STORE'?'MARKETPLACE_GOODS':'EVENT_TICKET'
  let intent
  if(input.action==='INITIALIZE'){
   if(input.mode==='DIRECT')intent=await recordPlannedPaymentIntent(direct)
   else{
    if(!(await eligibleRecipients()).some(r=>r.kind===input.mode&&r.id===input.beneficiaryId))throw errors.badRequest('Choose an eligible verified sandbox beneficiary.')
    intent=await recordPlannedPaymentIntent(splitCertificationIdentity(user.id,input.caseId,input.mode,input.beneficiaryId!))
   }
  }else intent=await db.platformPaymentIntent.findUnique({where:{purpose_sourceId:{purpose,sourceId:direct.sourceId}}})
  const identity=input.mode==='DIRECT'?direct:splitCertificationIdentity(user.id,input.caseId,input.mode,intent?.beneficiaryId??'')
  if(!intent||intent.reference!==identity.reference||intent.pricingVersion!==identity.pricingVersion||intent.totalMinor!==identity.totalMinor||intent.route!==(input.mode==='DIRECT'?'PLATFORM_DIRECT':'PROVIDER_SPLIT')||(input.mode!=='DIRECT'&&(intent.beneficiaryKind!==input.mode||!intent.beneficiaryId||intent.platformGrossMinor!==SPLIT_CERTIFICATION_COMMISSION_MINOR)))throw errors.notFound('Certification case not found.')
  await db.auditLog.create({data:{actorUserId:user.id,actorLabel:'finance-admin',action:'payment.certification.'+input.action.toLowerCase(),entityType:'PlatformPaymentIntent',entityId:intent.id,after:JSON.stringify({environment:'test',reference:intent.reference,mode:input.mode})}})
  try{
   const result=input.action==='INITIALIZE'?await initializePreparedSandboxCheckout(intent.id,account.email):await reconcilePreparedSandboxCollection(intent.id,account.email)
   return jsonOk({...result,reference:intent.reference,liveEnabled:false})
  }catch{throw errors.conflict('Test operation not confirmed. Inspect the case; uncertain initialization must not be retried automatically.')}
 })
}
