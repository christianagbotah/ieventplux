/** Read-only provider probe. Never create subaccounts or transactions here. */
export class SandboxVerificationError extends Error {}
export function parseSandboxReview(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new SandboxVerificationError('Review details required.')
 const x=raw as Record<string,unknown>
 if(Object.keys(x).length!==3||typeof x.storeSlug!=='string'||!/^[a-z0-9][a-z0-9-]{2,58}[a-z0-9]$/.test(x.storeSlug)||typeof x.subaccountCode!=='string'||!/^ACCT_[A-Za-z0-9]{5,80}$/.test(x.subaccountCode)||x.ownerReviewed!==true)throw new SandboxVerificationError('Enter a test subaccount code and confirm the seller mapping was reviewed.')
 return {storeSlug:x.storeSlug,subaccountCode:x.subaccountCode}
}
export function validateSandboxSubaccount(raw:unknown,code:string){
 if(!raw||typeof raw!=='object')throw new SandboxVerificationError('Provider verification failed.')
 const x=raw as {status?:unknown;data?:Record<string,unknown>}
 const d=x.data
 if(x.status!==true||!d||d.subaccount_code!==code||d.domain!=='test'||d.currency!=='GHS'||d.active!==true||d.is_verified!==true||d.product!=='collection'||d.settlement_schedule!=='AUTO'||typeof d.account_number!=='string'||!/^\d{4,25}$/.test(d.account_number)||typeof d.settlement_bank!=='string'||!d.settlement_bank.trim()||d.settlement_bank.length>120)throw new SandboxVerificationError('Provider did not confirm an active, verified Ghana test collection subaccount with automatic settlement.')
 return {maskedAccount:'•••• '+d.account_number.slice(-4),bankName:d.settlement_bank.trim()}
}
export async function verifySandboxSubaccount(code:string){
 if(!/^ACCT_[A-Za-z0-9]{5,80}$/.test(code))throw new SandboxVerificationError('Invalid test subaccount code.')
 const key=process.env.MARKETPLACE_PAYSTACK_TEST_SECRET_KEY?.trim()
 if(!key||!/^sk_test_[A-Za-z0-9]+$/.test(key))throw new SandboxVerificationError('Paystack test integration is not configured. Live keys are not accepted.')
 let response:Response
 try{response=await fetch('https://api.paystack.co/subaccount/'+encodeURIComponent(code),{method:'GET',headers:{Authorization:'Bearer '+key,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)})}catch{throw new SandboxVerificationError('Paystack test verification is temporarily unavailable.')}
 if(!response.ok)throw new SandboxVerificationError('Paystack did not confirm this test subaccount.')
 let body:unknown
 try{body=await response.json()}catch{throw new SandboxVerificationError('Invalid provider verification response.')}
 return validateSandboxSubaccount(body,code)
}
