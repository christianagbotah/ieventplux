import {createHash} from 'node:crypto'
import {db} from '@/lib/db'
import {prepareSandboxAttempt} from './platform-sandbox-attempts'
import {initializeTestCheckout,verifyTestCollection,sandboxTransportKey} from '../platform-paystack-transport'
/** Internal certification entry point only. No HTTP route; no live credentials.
 * Never retry an ambiguous initialization automatically. */
export async function initializePreparedSandboxCheckout(intentId:string,email:string){
 const key=sandboxTransportKey(process.env)
 const {attemptId,plan}=await prepareSandboxAttempt(intentId,email)
 const requestHash=createHash('sha256').update(JSON.stringify(plan)).digest('hex')
 try{await db.platformSandboxCheckout.create({data:{attemptId,requestHash,status:'INITIALIZING'}})}
 catch(e){
  if(!e||typeof e!=='object'||!('code' in e)||e.code!=='P2002')throw e
  const existing=await db.platformSandboxCheckout.findUniqueOrThrow({where:{attemptId}})
  if(existing.requestHash!==requestHash||existing.status!=='REDIRECTED'||!existing.checkoutUrl)throw new Error('Checkout already claimed or uncertain; reconciliation required.')
  return {attemptId,checkoutUrl:existing.checkoutUrl,environment:'test' as const,fulfillmentEnabled:false as const}
 }
 try{
  const initialized=await initializeTestCheckout(plan,key)
  await db.platformSandboxCheckout.update({where:{attemptId},data:{status:'REDIRECTED',checkoutUrl:initialized.checkoutUrl}})
  return {attemptId,checkoutUrl:initialized.checkoutUrl,environment:'test' as const,fulfillmentEnabled:false as const}
 }catch{
  await db.platformSandboxCheckout.updateMany({where:{attemptId,status:'INITIALIZING'},data:{status:'UNKNOWN'}})
  throw new Error('Sandbox initialization uncertain; do not retry automatically.')
 }
}
/** Independent provider confirmation. Evidence only; never issues tickets,
 * credits ledgers, enables plans, advertises, or claims settlement. */
export async function reconcilePreparedSandboxCollection(intentId:string,email:string){
 const key=sandboxTransportKey(process.env)
 const {attemptId,plan}=await prepareSandboxAttempt(intentId,email)
 const checkout=await db.platformSandboxCheckout.findUnique({where:{attemptId}})
 if(!checkout||checkout.requestHash!==createHash('sha256').update(JSON.stringify(plan)).digest('hex'))throw new Error('Matching initialized request required.')
 const verified=await verifyTestCollection(plan,key)
 return db.$transaction(async tx=>{
  const attempt=await tx.platformSandboxAttempt.findUniqueOrThrow({where:{id:attemptId}})
  if(attempt.providerTransactionId&&attempt.providerTransactionId!==verified.providerTransactionId)throw new Error('Notification and verification identity mismatch.')
  const data={attemptId,providerTransactionId:verified.providerTransactionId,amountMinor:verified.amountMinor,currency:verified.currency,recipientCode:plan.subaccount??null,allocation:verified.allocation}
  const existing=await tx.platformSandboxCollectionEvidence.upsert({where:{attemptId},create:data,update:{}})
  if(existing.providerTransactionId!==data.providerTransactionId||existing.amountMinor!==data.amountMinor||existing.currency!==data.currency||existing.recipientCode!==data.recipientCode||existing.allocation!==data.allocation)throw new Error('Conflicting collection evidence.')
  return {attemptId,collection:verified.collection,allocation:verified.allocation,fulfillmentEnabled:false as const}
 })
}
