'use client'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card,CardContent} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {api} from '../api'
import {GHANA_REGIONS} from '@/server/service-area-catalogue-policy'
export function ServiceAreaAdmin(){
 const [region,setRegion]=useState(''),[name,setName]=useState(''),[lat,setLat]=useState(''),[lon,setLon]=useState(''),[attested,setAttested]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function create(){setBusy(true);setMessage('');try{await api.post('/admin/service-areas',{name,region,latitude:Number(lat),longitude:Number(lon),attested});setName('');setLat('');setLon('');setAttested(false);setMessage('Reviewed community added.')}catch(e){setMessage(e instanceof Error?e.message:'Community creation failed.')}finally{setBusy(false)}}
 return <Card className="rounded-2xl"><CardContent className="space-y-3 p-5"><h2 className="text-xl font-bold">Reviewed community catalogue</h2><p className="text-sm text-muted-foreground">Use a verified public community centre, not a household or personal location. Confirm your password in Profile → Security before adding an entry.</p><div className="grid gap-3 sm:grid-cols-2"><div><Label>Region</Label><select aria-label="Region" className="h-10 w-full rounded-md border bg-background px-2" value={region} onChange={e=>setRegion(e.target.value)}><option value="">Choose region</option>{GHANA_REGIONS.map(r=><option key={r}>{r}</option>)}</select></div><div><Label>Community</Label><Input aria-label="Community" value={name} maxLength={100} onChange={e=>setName(e.target.value)}/></div><div><Label>Public centroid latitude</Label><Input aria-label="Public centroid latitude" inputMode="decimal" value={lat} onChange={e=>setLat(e.target.value)}/></div><div><Label>Public centroid longitude</Label><Input aria-label="Public centroid longitude" inputMode="decimal" value={lon} onChange={e=>setLon(e.target.value)}/></div></div><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/>I have independently verified that this is a public community anchor, not an individual's location.</label><Button disabled={busy||!attested||!region||name.trim().length<2||!lat.trim()||!lon.trim()} onClick={()=>void create()}>Add reviewed community</Button>{message&&<p role="status" className="text-sm">{message}</p>}</CardContent></Card>
}
