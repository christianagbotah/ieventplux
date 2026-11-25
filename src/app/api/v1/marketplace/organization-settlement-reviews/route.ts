import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,requirePlatformRole,requireElevated,errors,readJson,rateLimit} from '@/server/api'
import {parseSandboxReview,verifySandboxSubaccount,SandboxVerificationError} from '@/server/marketplace-paystack-sandbox'
import {eligibleOrganizationSettlement} from '@/server/organization-settlement-policy'
export async function GET(){
 return handle(async()=>{
  await requirePlatformRole('admin:finance')
  const items=await db.organizationSettlementOnboarding.findMany({orderBy:{updatedAt:'desc'},take:100,select:{state:true,maskedAccount:true,bankName:true,org:{select:{slug:true,name:true,status:true}}}})
  return jsonOk({items:items.map(({org,...item})=>({...item,store:org})),checkoutEnabled:false})
 })
}
export async function POST(req:NextRequest){
 return handle(async()=>{
  await requirePlatformRole('admin:finance')
  const user=await requireElevated()
  await rateLimit(req,'organization-settlement-review',10,60000)
  let input
  try{input=parseSandboxReview(await readJson(req))}catch(e){if(e instanceof SandboxVerificationError)throw errors.badRequest(e.message);throw e}
  const org=await db.organization.findUnique({where:{slug:input.storeSlug,deletedAt:null},select:{id:true,ownerId:true,country:true,status:true,verifiedAt:true,verification:{select:{status:true}}}})
  if(!org||!eligibleOrganizationSettlement(org))throw errors.badRequest('Verified Ghana organization required.')
  if(org.ownerId===user.id||await db.membership.findFirst({where:{orgId:org.id,userId:user.id,acceptedAt:{not:null}}}))throw errors.forbidden('Reviewers must be independent of the organization.')
  const existing=await db.organizationSettlementOnboarding.findUnique({where:{orgId:org.id}})
  if(existing?.state!=='REQUESTED'||existing.requestedBy!==org.ownerId)throw errors.conflict('Pending owner request required.')
  let verified
  try{verified=await verifySandboxSubaccount(input.subaccountCode)}catch(e){if(e instanceof SandboxVerificationError)throw errors.badRequest(e.message);throw e}
  try{
   await db.$transaction(async tx=>{
    const fresh=await tx.organization.findUnique({where:{id:org.id,deletedAt:null},select:{ownerId:true,country:true,status:true,verifiedAt:true,verification:{select:{status:true}}}})
    if(!fresh||fresh.ownerId!==org.ownerId||!eligibleOrganizationSettlement(fresh)||await tx.membership.findFirst({where:{orgId:org.id,userId:user.id,acceptedAt:{not:null}}}))throw errors.conflict('Organization eligibility or reviewer independence changed.')
    await tx.sandboxSettlementClaim.create({data:{code:input.subaccountCode,beneficiaryKind:'ORGANIZATION',beneficiaryId:org.id}})
    const changed=await tx.organizationSettlementOnboarding.updateMany({where:{orgId:org.id,state:'REQUESTED',requestedBy:org.ownerId},data:{state:'SANDBOX_VERIFIED',testSubaccountCode:input.subaccountCode,...verified,reviewedBy:user.id,reviewedAt:new Date()}})
    if(changed.count!==1)throw errors.conflict('Request changed.')
    await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'finance-admin',action:'organization.settlement.sandbox_verified',entityType:'Organization',entityId:org.id,after:JSON.stringify({state:'SANDBOX_VERIFIED'})}})
   })
  }catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code==='P2002')throw errors.conflict('Sandbox account or beneficiary already linked.');throw e}
  return jsonOk({settlementStatus:'SANDBOX_VERIFIED',checkoutEnabled:false})
 })
}
