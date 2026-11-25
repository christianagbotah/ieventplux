import {SERVICE_CATEGORIES,type ServiceCategory} from './service-directory-policy'
export function parseServiceProviderEnrollment(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid enrollment')
 const x=raw as Record<string,unknown>
 if(Object.keys(x).length!==5||!['category','country','community','displayName','serviceDescription'].every(k=>Object.prototype.hasOwnProperty.call(x,k)))throw new Error('Unexpected enrollment fields')
 if(x.country!=='GH'||!SERVICE_CATEGORIES.some(c=>c.id===x.category))throw new Error('Unsupported pilot category or country')
 const field=(v:unknown,min:number,max:number)=>{
  if(typeof v!=='string')throw new Error('Invalid text')
  const t=v.trim()
  if(t.length<min||t.length>max||/[\u0000-\u001f\u007f]/.test(t))throw new Error('Invalid text')
  return t
 }
 return {category:x.category as ServiceCategory,country:'GH',community:field(x.community,2,100),displayName:field(x.displayName,2,100),serviceDescription:field(x.serviceDescription,10,1000)}
}
