import {NextRequest} from 'next/server'
import {db} from '@/lib/db'
import {handle,jsonOk,requireUser,errors,rateLimit} from '@/server/api'
import {membershipFor,orgCan} from '@/server/permissions'
import {eligibleOrganizationSettlement,canRequestOrganizationSettlement} from '@/server/organization-settlement-policy'
type Context={params:Promise<{id:string}>}
async function access(id:string,userId:string){
 const member=await membershipFor(userId,id)
 if(!member||!orgCan(member.role,'org:manage_payouts'))throw errors.forbidden('Organization finance access required.')
 const org=await db.organization.findUnique({where:{id,deletedAt:null},select:{id:true,ownerId:true,country:true,status:true,verifiedAt:true,verification:{select:{status:true}}}})
 if(!org)throw errors.notFound('Organization not found.')
 return {member,org}
}
export async function GET(_req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser()
  const {member,org}=await access((await ctx.params).id,user.id)
  const account=await db.user.findUnique({where:{id:user.id},select:{emailVerifiedAt:true,status:true}})
  const record=await db.organizationSettlementOnboarding.findUnique({where:{orgId:org.id},select:{state:true,bankName:true,maskedAccount:true}})
  return jsonOk({settlementStatus:record?.state??'NOT_CONFIGURED',bankName:record?.bankName??null,maskedAccount:record?.maskedAccount??null,eligible:eligibleOrganizationSettlement(org),canRequest:canRequestOrganizationSettlement(org,org.ownerId,user.id,member.role,!!account?.emailVerifiedAt,account?.status??''),checkoutEnabled:false})
 })
}
export async function POST(req:NextRequest,ctx:Context){
 return handle(async()=>{
  const user=await requireUser()
  await rateLimit(req,'organization-settlement-onboarding',8,60000)
  const {member,org}=await access((await ctx.params).id,user.id)
  const account=await db.user.findUnique({where:{id:user.id},select:{emailVerifiedAt:true,status:true}})
  if(!canRequestOrganizationSettlement(org,org.ownerId,user.id,member.role,!!account?.emailVerifiedAt,account?.status??''))throw errors.forbidden('The verified Ghana organization owner must request onboarding.')
  try{
   await db.$transaction(async tx=>{
    await tx.organizationSettlementOnboarding.create({data:{orgId:org.id,requestedBy:user.id}})
    await tx.auditLog.create({data:{actorUserId:user.id,actorLabel:'organization-owner',action:'organization.settlement.request',entityType:'Organization',entityId:org.id,after:JSON.stringify({state:'REQUESTED'})}})
   })
  }catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code==='P2002')throw errors.conflict('Settlement onboarding already requested.');throw e}
  return jsonOk({settlementStatus:'REQUESTED',checkoutEnabled:false},{status:201})
 })
}
