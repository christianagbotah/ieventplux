'use client'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog'
import {SubmissionFeedback} from '@/components/ui/submission-feedback'
import {ORGANIZER_TYPE_CONFIG,organizerType,type ProfileDetails} from '@/lib/organization-types'
import {api} from '../api'
import {useToast} from '@/hooks/use-toast'

type Profile={name:string;slug:string;verified:boolean;orgType:string;tagline?:string|null;description?:string|null;city?:string|null;address?:string|null;contactEmail?:string|null;contactPhone?:string|null;website?:string|null;mapsUrl?:string|null;latitude?:number|null;longitude?:number|null;socialLinks?:Record<string,string>;profileDetails?:ProfileDetails}
const platforms=['facebook','instagram','tiktok','youtube','x','linkedin','whatsapp']
export function OrganizerProfileEditor({org,onClose,onSaved}:{org:Profile;onClose:()=>void;onSaved:()=>void}){
 const {toast}=useToast()
 const type=organizerType(org.orgType)
 const config=type?ORGANIZER_TYPE_CONFIG[type]:null
 const [draft,setDraft]=useState({name:org.name,tagline:org.tagline??'',description:org.description??'',city:org.city??'',address:org.address??'',contactEmail:org.contactEmail??'',contactPhone:org.contactPhone??'',website:org.website??'',mapsUrl:org.mapsUrl??'',latitude:org.latitude?.toString()??'',longitude:org.longitude?.toString()??''})
 const [details,setDetails]=useState<ProfileDetails>(org.profileDetails??{})
 const [links,setLinks]=useState(org.socialLinks??{})
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [attempt,setAttempt]=useState(0)
 const field=(key:keyof typeof draft,label:string,limit:number,options:{disabled?:boolean;type?:string}={})=><div className="min-w-0 space-y-1.5"><Label htmlFor={'org-edit-'+key}>{label}</Label><Input id={'org-edit-'+key} type={options.type??'text'} disabled={busy||options.disabled} value={draft[key]} maxLength={limit} onChange={e=>setDraft(old=>({...old,[key]:e.target.value}))}/></div>
 async function save(){
  if(busy)return
  setBusy(true);setError('')
  try{
   await api.patch('/orgs/'+encodeURIComponent(org.slug)+'/profile',{...draft,...(config?{profileDetails:details}:{}),socialLinks:links})
   toast({title:'Profile updated',description:'Your public profile information has been saved.'})
   onSaved()
  }catch(e){
   const message=e instanceof Error?e.message:'Could not save the profile.'
   setError(message);setAttempt(n=>n+1);toast({title:'Profile not saved',description:message,variant:'destructive',duration:10000})
  }finally{setBusy(false)}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose()}}>
  <DialogContent className="flex max-w-2xl flex-col gap-3 overflow-hidden" showCloseButton={!busy}>
   <DialogHeader><DialogTitle>Edit profile</DialogTitle><DialogDescription>These details are visible on your public organizer profile. Your sign-in details are separate.</DialogDescription></DialogHeader>
   <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-1 py-1">
    <SubmissionFeedback message={error} attempt={attempt}/>
    {field('name',config?.nameLabel??'Public name',120,{disabled:org.verified})}
    {org.verified&&<p className="text-xs text-muted-foreground">Your verified name requires identity review to change. Contact support for a name change.</p>}
    {field('tagline',config?.taglineLabel??'Tagline',160)}
    <div className="space-y-1.5"><Label htmlFor="org-edit-about">{config?.descriptionLabel??'About'}</Label><Textarea id="org-edit-about" value={draft.description} maxLength={2000} rows={4} disabled={busy} onChange={e=>setDraft(old=>({...old,description:e.target.value}))}/></div>
    {config&&<div className="space-y-2 border-t pt-3"><h3 className="text-sm font-semibold">{config.detailsTitle}</h3><div className="grid gap-3 sm:grid-cols-2">{config.fields.filter(f=>f.key!=='registrationNumber').map(f=><div key={f.key} className="min-w-0 space-y-1.5"><Label htmlFor={'org-detail-'+f.key}>{f.label}</Label><Input id={'org-detail-'+f.key} value={details[f.key]??''} placeholder={f.placeholder} maxLength={160} disabled={busy} onChange={e=>setDetails(old=>({...old,[f.key]:e.target.value}))}/></div>)}</div></div>}
    <div className="space-y-3 border-t pt-3"><h3 className="text-sm font-semibold">Public contact & location</h3>
     <div className="grid gap-3 sm:grid-cols-2">{field('contactEmail','Public email',160,{type:'email'})}{field('contactPhone','Public phone',24,{type:'tel'})}{field('city','City',60)}{field('website','Website',200)}</div>
     {field('address','Public address',300)}{field('mapsUrl','Google Maps link',500)}
     <div className="grid grid-cols-2 gap-3">{field('latitude','Latitude',30)}{field('longitude','Longitude',30)}</div>
     <p className="text-xs text-muted-foreground">Only share contact information and a location you want visitors to see.</p>
    </div>
    <div className="space-y-3 border-t pt-3"><h3 className="text-sm font-semibold">Social media</h3><div className="grid gap-3 sm:grid-cols-2">{platforms.map(platform=><div className="min-w-0 space-y-1.5" key={platform}><Label htmlFor={'org-social-'+platform} className="capitalize">{platform==='x'?'X / Twitter':platform}</Label><Input id={'org-social-'+platform} value={links[platform]??''} maxLength={250} disabled={busy} placeholder="Profile link or handle" onChange={e=>setLinks(old=>({...old,[platform]:e.target.value}))}/></div>)}</div></div>
   </div>
   <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save profile'}</Button></DialogFooter>
  </DialogContent>
 </Dialog>
}
