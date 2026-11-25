import {parseSandboxInitialization,parseSandboxCollection,type SandboxCheckoutPlan} from './platform-paystack-adapter'
export function sandboxTransportKey(env:Record<string,string|undefined>){
 const key=env.MARKETPLACE_PAYSTACK_TEST_SECRET_KEY?.trim()
 if(env.IEVENTPLUX_PAYSTACK_SANDBOX_ENABLED!=='yes'||!key||!/^sk_test_[A-Za-z0-9]+$/.test(key))throw new Error('Sandbox transport is disabled or test credentials are missing.')
 return key
}
export function assertTestReference(reference:string){
 if(!/^TEST-[A-Za-z0-9.=-]{1,95}$/.test(reference))throw new Error('Only sandbox-prefixed references are allowed.')
}
async function request(path:string,key:string,method:'GET'|'POST',body?:object,fetcher:typeof fetch=fetch){
 if(!/^sk_test_[A-Za-z0-9]+$/.test(key))throw new Error('Only test credentials are accepted.')
 let response:Response
 try{response=await fetcher('https://api.paystack.co'+path,{method,headers:{Authorization:'Bearer '+key,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)})}catch{throw new Error('Sandbox provider request outcome is unknown.')}
 if(!response.ok)throw new Error('Sandbox provider did not confirm the request.')
 try{return await response.json()}catch{throw new Error('Invalid sandbox response.')}
}
export async function initializeTestCheckout(plan:SandboxCheckoutPlan,key:string,fetcher:typeof fetch=fetch){
 assertTestReference(plan.reference)
 if(plan.currency!=='GHS'||!Number.isSafeInteger(plan.amount)||plan.amount<=0||plan.amount>100_000_000)throw new Error('Invalid sandbox amount.')
 return parseSandboxInitialization(await request('/transaction/initialize',key,'POST',plan,fetcher),plan.reference)
}
export async function verifyTestCollection(plan:SandboxCheckoutPlan,key:string,fetcher:typeof fetch=fetch){
 assertTestReference(plan.reference)
 const raw=await request('/transaction/verify/'+encodeURIComponent(plan.reference),key,'GET',undefined,fetcher)
 const evidence=parseSandboxCollection(raw,plan)
 const id=raw?.data?.id
 if(!Number.isSafeInteger(id)||id<=0)throw new Error('Provider transaction identity missing.')
 return {...evidence,providerTransactionId:String(id)}
}
