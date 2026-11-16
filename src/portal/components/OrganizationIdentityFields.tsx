'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { MapPin, ImagePlus, ExternalLink } from 'lucide-react'

export type SocialLinks = Record<'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'x' | 'linkedin' | 'whatsapp', string>
export type OrgFieldsValue = {
  tagline: string; description: string; city: string; address: string
  contactEmail: string; contactPhone: string; website: string; mapsUrl: string
  latitude: string; longitude: string; socialLinks: SocialLinks
}
export const emptyOrgFields: OrgFieldsValue = {
  tagline: '', description: '', city: '', address: '',
  contactEmail: '', contactPhone: '', website: '', mapsUrl: '',
  latitude: '', longitude: '',
  socialLinks: { facebook: '', instagram: '', tiktok: '', youtube: '', x: '', linkedin: '', whatsapp: '' },
}
const SOCIALS = [
  ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'],
  ['x', 'X / Twitter'], ['linkedin', 'LinkedIn'], ['whatsapp', 'WhatsApp'],
] as const

export function OrganizationIdentityFields({ value, onChange, logoUrl, logoFile, onLogoFile }: {
  value: OrgFieldsValue
  onChange: (form: OrgFieldsValue) => void
  logoUrl?: string | null
  logoFile?: File | null
  onLogoFile?: (file: File | null) => void
}) {
  const [gpsError, setGpsError] = useState('')
  const update = (key: keyof Omit<OrgFieldsValue, 'socialLinks'>, val: string) => onChange({ ...value, [key]: val })
  const fillGps = () => {
    if (!navigator.geolocation) return setGpsError('Your browser does not support GPS location.')
    setGpsError('')
    navigator.geolocation.getCurrentPosition(
      (position) => onChange({ ...value, latitude: position.coords.latitude.toFixed(6), longitude: position.coords.longitude.toFixed(6) }),
      () => setGpsError('Location access was unavailable. You can enter the coordinates manually.'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="org-tagline">Tagline</Label><Input id="org-tagline" value={value.tagline} maxLength={160} onChange={(e) => update('tagline', e.target.value)} placeholder="What makes your organization special?" /></div>
        <div className="space-y-1.5"><Label htmlFor="org-city">City</Label><Input id="org-city" value={value.city} maxLength={60} onChange={(e) => update('city', e.target.value)} placeholder="Accra" /></div>
        <div className="space-y-1.5"><Label htmlFor="org-email">Public email</Label><Input id="org-email" type="email" value={value.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} placeholder="hello@yourcompany.com" /></div>
        <div className="space-y-1.5"><Label htmlFor="org-phone">Contact phone</Label><Input id="org-phone" type="tel" value={value.contactPhone} onChange={(e) => update('contactPhone', e.target.value)} placeholder="+233..." /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="org-website">Website</Label><Input id="org-website" value={value.website} onChange={(e) => update('website', e.target.value)} placeholder="https://yourcompany.com" /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="org-about">About the organization</Label><Textarea id="org-about" rows={3} value={value.description} onChange={(e) => update('description', e.target.value)} placeholder="Tell attendees who you are..." /></div>
      </div>
      <fieldset className="space-y-3 rounded-xl border border-border/70 p-4">
        <legend className="px-1 text-sm font-semibold">Address and Google Maps location</legend>
        <div className="space-y-1.5"><Label htmlFor="org-address">Street address / GhanaPost GPS</Label><Input id="org-address" value={value.address} onChange={(e) => update('address', e.target.value)} placeholder="Street, area, GhanaPost GPS digital address" /></div>
        <div className="space-y-1.5"><Label htmlFor="org-maps">Google Maps share link</Label><Input id="org-maps" value={value.mapsUrl} onChange={(e) => update('mapsUrl', e.target.value)} placeholder="https://maps.app.goo.gl/..." /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="org-lat">Latitude</Label><Input id="org-lat" inputMode="decimal" value={value.latitude} onChange={(e) => update('latitude', e.target.value)} placeholder="5.603717" /></div>
          <div className="space-y-1.5"><Label htmlFor="org-lng">Longitude</Label><Input id="org-lng" inputMode="decimal" value={value.longitude} onChange={(e) => update('longitude', e.target.value)} placeholder="-0.186964" /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={fillGps}><MapPin className="mr-1.5 h-4 w-4" /> Use my GPS location</Button>
          {value.mapsUrl.startsWith('https://') && <a className="inline-flex items-center gap-1 text-xs text-primary underline" href={value.mapsUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" /> Preview map</a>}
        </div>
        {gpsError && <p role="status" className="text-xs text-amber-600">{gpsError}</p>}
      </fieldset>
      <fieldset className="rounded-xl border border-border/70 p-4">
        <legend className="px-1 text-sm font-semibold">Social media profiles</legend>
        <p className="mb-3 text-xs text-muted-foreground">Enter a full link or @handle. Add only the profiles your organization uses.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIALS.map(([key, label]) => (
            <div className="space-y-1.5" key={key}><Label htmlFor={'social-' + key}>{label}</Label><Input id={'social-' + key} value={value.socialLinks[key]} onChange={(e) => onChange({ ...value, socialLinks: { ...value.socialLinks, [key]: e.target.value } })} placeholder={key === 'whatsapp' ? '+233...' : '@handle or https://...'} /></div>
          ))}
        </div>
      </fieldset>
      {onLogoFile && <div className="rounded-xl border border-border/70 p-4">
        <Label htmlFor="org-logo" className="flex items-center gap-2"><ImagePlus className="h-4 w-4" /> Organization logo</Label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {logoUrl && <img src={logoUrl} alt="Current organization logo" className="h-16 w-16 rounded-xl border object-contain" />}
          <Input id="org-logo" type="file" accept="image/png,image/jpeg,image/webp" className="max-w-sm" onChange={(e) => onLogoFile(e.target.files?.[0] || null)} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">PNG, JPEG or WebP, up to 3 MB. The image will be optimized and displayed on your public profile.</p>
        {logoFile && <p className="mt-1 text-xs font-medium">{logoFile.name} selected</p>}
      </div>}
    </div>
  )
}
