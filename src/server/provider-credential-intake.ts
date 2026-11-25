import {errors} from '@/server/api'
import {providerIntakeEnabled} from './provider-credential-intake-policy'
export function requireProviderIntake(){
 if(!providerIntakeEnabled(process.env))throw errors.unavailable('PROVIDER_INTAKE_DISABLED','Credential intake awaits privacy, retention and jurisdiction certification.')
}
export const credentialProjection={id:true,kind:true,mime:true,size:true,uploadedAt:true,reviewStatus:true,reviewedAt:true} as const
export function providerDocumentNamespace(id:string){
 if(!/^[a-z0-9]{8,60}$/i.test(id))throw errors.badRequest('Invalid provider identifier.')
 return 'provider-'+id
}
