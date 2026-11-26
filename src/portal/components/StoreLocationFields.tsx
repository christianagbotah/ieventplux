'use client'
import {useEffect,useId,useRef,useState} from 'react'
import {MapPin,LocateFixed,ExternalLink} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {VenueMapPicker} from './VenueMapPicker'
import {validPin} from '../lib/venue-locations'
import {SubmissionFeedback} from '@/components/ui/submission-feedback'
export type StoreLocationDraft={gpsAddress:string;latitude:string;longitude:string}
export const emptyStoreLocation:StoreLocationDraft={gpsAddress:'',latitude:'',longitude:''}
export function locationPayload(value:StoreLocationDraft){
 const lat=value.latitude.trim(),lng=value.longitude.trim()
 if(!lat&&!lng)return {gpsAddress:value.gpsAddress.trim()||null,latitude:null,longitude:null}
 if(!lat||!lng||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng))||Math.abs(Number(lat))>90||Math.abs(Number(lng))>180)throw new Error('Enter valid latitude and longitude together.')
 return {gpsAddress:value.gpsAddress.trim()||null,latitude:Number(lat),longitude:Number(lng)}
}
export function StoreLocationFields({value,onChange,disabled=false,region}:{value:StoreLocationDraft;onChange:(v:StoreLocationDraft)=>void;disabled?:boolean;region?:string}){
 const id=useId()
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [mapOpen,setMapOpen]=useState(false)
 const [attempt,setAttempt]=useState(0)
 const latest=useRef(value)
 useEffect(()=>{latest.current=value},[value])
 const set=(key:keyof StoreLocationDraft,v:string)=>onChange({...value,[key]:v})
 const locate=()=>{
  setError('')
  if(!navigator.geolocation){setError('Location is unavailable on this device. Enter coordinates from Maps instead.');setAttempt(n=>n+1);return}
  setBusy(true)
  navigator.geolocation.getCurrentPosition(position=>{onChange({...latest.current,latitude:position.coords.latitude.toFixed(6),longitude:position.coords.longitude.toFixed(6)});setBusy(false)},()=>{setError('Unable to get your location. Check location permission or enter coordinates from Maps.');setAttempt(n=>n+1);setBusy(false)},{enableHighAccuracy:true,timeout:15000,maximumAge:0})
 }
 const mapsQuery=value.latitude&&value.longitude?value.latitude+','+value.longitude:value.gpsAddress||'Ghana'
 return <fieldset disabled={disabled||busy} className="space-y-3 rounded-xl border p-3">
  <legend className="px-1 text-sm font-semibold"><MapPin className="mr-1 inline size-4"/> Store location</legend>
  <div className="space-y-1"><Label htmlFor={id+'-gps'}>GhanaPost GPS address</Label><Input id={id+'-gps'} value={value.gpsAddress} maxLength={14} onChange={e=>set('gpsAddress',e.target.value)} placeholder="GA-123-4567"/></div>
  <div className="grid grid-cols-2 gap-2">
   <div className="min-w-0 space-y-1"><Label htmlFor={id+'-lat'}>Latitude</Label><Input id={id+'-lat'} inputMode="decimal" value={value.latitude} onChange={e=>set('latitude',e.target.value)} placeholder="5.603717"/></div>
   <div className="min-w-0 space-y-1"><Label htmlFor={id+'-lng'}>Longitude</Label><Input id={id+'-lng'} inputMode="decimal" value={value.longitude} onChange={e=>set('longitude',e.target.value)} placeholder="-0.186964"/></div>
  </div>
  <div className="grid grid-cols-2 gap-2">
   <Button type="button" variant="outline" size="sm" className="h-auto min-h-11 min-w-0 py-2" onClick={locate}><LocateFixed className="size-4"/>{busy?'Locating…':'Use my location'}</Button>
   <Button type="button" variant="outline" size="sm" className="h-auto min-h-11 min-w-0 py-2" asChild><a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(mapsQuery)} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4"/>Google Maps</a></Button>
  </div>
  <Button type="button" variant="outline" className="w-full" onClick={()=>setMapOpen(open=>!open)} aria-expanded={mapOpen}><MapPin className="size-4"/>{mapOpen?'Close map':'Pick location on map'}</Button>
  {mapOpen&&<VenueMapPicker initialPin={value.latitude.trim()&&value.longitude.trim()?validPin(Number(value.latitude),Number(value.longitude)):null} country="GH" region={region} onCancel={()=>setMapOpen(false)} onPick={pin=>{onChange({...latest.current,latitude:pin.lat.toFixed(6),longitude:pin.lng.toFixed(6)});setMapOpen(false)}}/>}
  <SubmissionFeedback message={error} attempt={attempt}/>
  <p className="text-xs leading-relaxed text-muted-foreground">Pick your business on the interactive map, paste a Google Maps link containing coordinates, or use your current location while at the store. GPS codes are saved as addresses; coordinates are required for nearby searches. Use a public business location, not a private home address unless you intend it to be discoverable.</p>
 </fieldset>
}
