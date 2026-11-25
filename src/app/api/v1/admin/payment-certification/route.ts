import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,requirePlatformRole,requireElevated,rateLimit,readJson,errors} from '@/server/api'
import {sandboxTransportKey} from '@/server/platform-paystack-transport'
import {recordPlannedPaymentIntent} from '@/server/services/platform-payment-intents'
import {initializePreparedSandboxCheckout,reconcilePreparedSandboxCollection} from '@/server/services/platform-sandbox-connectivity'
import {parseCertificationAction,certificationIdentity,CERTIFICATION_PRICE_VERSION,CERTIFICATION_AMOUNT_MINOR} from '@/server/payment-certification-policy'
function enabled(){try{sandboxTransportKey(process.env);return true}catch{return false}}
export async function GET(){
 return handle(async()=>{
  const user=await requirePlatformRole('admin:finance')
  const items=await db.platformPaymentIntent.findMany({where:{purpose:'SUBSCRIPTION',pricingVersion:CERTIFICATION_PRICE_VERSION,sourceId:{startsWith:'cert:'+user.id+':'},reference:{startsWith:'TEST-DIRECT-'}},orderBy:{createdAt:'desc'},take:20,select:{reference:true,createdAt:true,sandboxAttempt:{select:{checkout:{select:{status:true}},collectionEvidence:{select:{allocation:true,verifiedAt:true}}}}}})
  return jsonOk({enabled:enabled(),amountMinor:CERTIFICATION_AMOUNT_MINOR,items,liveEnabled:false})
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
  const identity=certificationIdentity(user.id,input.caseId)
  const intent=input.action==='INITIALIZE'?await recordPlannedPaymentIntent(identity):await db.platformPaymentIntent.findUnique({where:{purpose_sourceId:{purpose:identity.purpose,sourceId:identity.sourceId}}})
  if(!intent||intent.reference!==identity.reference||intent.pricingVersion!==identity.pricingVersion||intent.totalMinor!==identity.totalMinor||intent.route!=='PLATFORM_DIRECT')throw errors.notFound('Certification case not found.')
  await db.auditLog.create({data:{actorUserId:user.id,actorLabel:'finance-admin',action:'payment.certification.'+input.action.toLowerCase(),entityType:'PlatformPaymentIntent',entityId:intent.id,after:JSON.stringify({environment:'test',reference:intent.reference})}})
  try{
   const result=input.action==='INITIALIZE'?await initializePreparedSandboxCheckout(intent.id,account.email):await reconcilePreparedSandboxCollection(intent.id,account.email)
   return jsonOk({...result,reference:intent.reference,liveEnabled:false})
  }catch{throw errors.conflict('Test operation not confirmed. Inspect the case; uncertain initialization must not be retried automatically.')}
 })
}
