/** Planning-only: no charge, wallet, payout or provider network request.
 * Server callers must derive amounts from an immutable order and approved seller account.
 */
export type SettlementAccount = {provider:'PAYSTACK';subaccountCode:string;verified:boolean;country:'GH'}
export function planMarketplaceSettlement(totalMinor:number,commissionBps:number,account:SettlementAccount,feeBearer:'account'|'subaccount'='account'){
 if(!Number.isSafeInteger(totalMinor)||totalMinor<1||totalMinor>100_000_000)throw new Error('Invalid order total.')
 if(!Number.isSafeInteger(commissionBps)||commissionBps<0||commissionBps>10_000)throw new Error('Invalid commission policy.')
 if(!account.verified||account.provider!=='PAYSTACK'||account.country!=='GH'||!/^ACCT_[A-Za-z0-9]+$/.test(account.subaccountCode))throw new Error('A verified Ghana seller settlement account is required.')
 if(feeBearer!=='account'&&feeBearer!=='subaccount')throw new Error('Invalid fee allocation.')
 const platformMinor=Math.floor((totalMinor*commissionBps+5000)/10000)
 const sellerMinor=totalMinor-platformMinor
 if(sellerMinor<1)throw new Error('Seller proceeds must be positive.')
 return {currency:'GHS' as const,totalMinor,platformMinor,sellerMinor,feeBearer,
  providerParameters:{currency:'GHS' as const,amount:totalMinor,subaccount:account.subaccountCode,transaction_charge:platformMinor,bearer:feeBearer},
  activation:'NOT_ENABLED' as const}
}
