import { db } from '../lib/db'
import { bpOf } from './money'

/**
 * Fee rules. The active FeeVersion is snapshotted onto each order at purchase
 * time so later rate changes never rewrite history. See docs/PAYMENTS_AND_SETTLEMENTS.md.
 */

export interface FeeSnapshot {
  feeVersionId: string
  version: number
  name: string
  ticketCommissionBp: number // platform commission on ticket sales (organizer-borne)
  processingFeeBp: number // informational: payment processing (platform-borne policy)
  smsRateMinor: number
  currency: string
  policy: {
    commissionBearer: 'ORGANIZER'
    processingBearer: 'PLATFORM'
    refundPolicy: 'Commission retained on refunds; processing costs borne by platform.'
  }
}

export async function activeFeeVersion(): Promise<FeeSnapshot> {
  const fee = await db.feeVersion.findFirst({ where: { active: true }, orderBy: { version: 'desc' } })
  if (!fee) {
    return {
      feeVersionId: 'default',
      version: 0,
      name: 'Default 5%',
      ticketCommissionBp: 500,
      processingFeeBp: 195,
      smsRateMinor: 5,
      currency: 'GHS',
      policy: { commissionBearer: 'ORGANIZER', processingBearer: 'PLATFORM', refundPolicy: 'Commission retained on refunds; processing costs borne by platform.' },
    }
  }
  return {
    feeVersionId: fee.id,
    version: fee.version,
    name: fee.name,
    ticketCommissionBp: fee.ticketCommissionPct,
    processingFeeBp: fee.processingFeePct,
    smsRateMinor: fee.smsRateMinor,
    currency: fee.currency,
    policy: { commissionBearer: 'ORGANIZER', processingBearer: 'PLATFORM', refundPolicy: 'Commission retained on refunds; processing costs borne by platform.' },
  }
}

export function computePlatformFee(amountMinor: number, snapshot: FeeSnapshot): number {
  return bpOf(amountMinor, snapshot.ticketCommissionBp)
}
