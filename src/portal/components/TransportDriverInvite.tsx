'use client'
import {useEffect,useState} from 'react'
import {Button} from '@/components/ui/button'
import {api} from '../api'
export function TransportDriverInvite({providerId,vehicleId}:{providerId:string;vehicleId:string}){
 const [token,setToken]=useState(''),[expires,setExpires]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 useEffect(()=>{if(!expires)return;const timer=setTimeout(()=>{setToken('');setNotice('Invitation expired.')},Math.max(0,Date.parse(expires)-Date.now()));return()=>clearTimeout(timer)},[expires])
 async function create(){
  setBusy(true);setNotice('')
  try{const r=await api.post<{token:string;item:{expiresAt:string}}>('/service-providers/'+encodeURIComponent(providerId)+'/vehicles/'+encodeURIComponent(vehicleId)+'/driver-invitation',{});setToken(r.token);setExpires(r.item.expiresAt)}catch(e){setNotice(e instanceof Error?e.message:'Invitation failed.')}finally{setBusy(false)}
 }
 return <div className="space-y-2 rounded-lg border p-3">
 <p className="text-xs text-muted-foreground">Private roster only. Share an invitation exclusively with the intended driver. It is not a driving licence or dispatch authorization.</p>
 {!token?<Button size="sm" variant="outline" disabled={busy} onClick={()=>void create()}>Create driver invitation</Button>:<><p className="break-all rounded-md bg-muted p-2 font-mono text-sm select-all">{token}</p><p className="text-xs">Expires {new Date(expires).toLocaleTimeString()}. The code is shown once; do not post it publicly.</p><Button size="sm" variant="outline" onClick={()=>navigator.clipboard.writeText(token).then(()=>setNotice('Invitation copied.')).catch(()=>setNotice('Select the code to copy it manually.'))}>Copy invitation</Button><Button size="sm" variant="ghost" onClick={()=>setToken('')}>Hide code</Button></>}
 {notice&&<p role="status" className="text-sm">{notice}</p>}</div>
}
