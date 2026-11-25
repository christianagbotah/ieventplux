import {db} from '@/lib/db'
import {paymentIntentSnapshot,requireMatchingIntent,type IntentInput} from '../platform-payment-intent'
/** Foundation only: no public endpoint or provider/fulfillment invocation.
 * A repeat with identical inputs is safe; a changed quote must be a new purchase.
 */
export async function recordPlannedPaymentIntent(input:IntentInput){
 const snapshot=paymentIntentSnapshot(input)
 // Conflict-safe insert, never update financial columns on replay.
 try{
  return await db.platformPaymentIntent.create({data:snapshot})
 }catch(error){
  if(!error||typeof error!=='object'||!('code' in error)||error.code!=='P2002')throw error
  const existing=await db.platformPaymentIntent.findUnique({where:{purpose_sourceId:{purpose:snapshot.purpose,sourceId:snapshot.sourceId}}})
  if(!existing)throw new Error('Payment reference is already used by another purchase.')
  requireMatchingIntent(existing,snapshot)
  return existing
 }
}
