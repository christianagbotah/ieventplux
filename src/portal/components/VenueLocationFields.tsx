'use client'

import { useState } from 'react'
import { MapPin, ExternalLink, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { GHANA_REGIONS, GHANA_REGION_CITIES, COUNTRY_OPTIONS, mapsLink, parseMapsCoordinate, validPin } from '../lib/venue-locations'
import { VenueMapPicker } from './VenueMapPicker'

export type VenueLocationValue = {
  country: string
  region: string
  city: string
  address: string
  lat: string
  lng: string
  mapsUrl: string
}

export function VenueLocationFields({ value, onChange }: {
  value: VenueLocationValue
  onChange: (next: VenueLocationValue) => void
}) {
  const [mapOpen, setMapOpen] = useState(false)
  const [linkError, setLinkError] = useState('')
  const selected = validPin(value.lat, value.lng)
  const countryOptions = COUNTRY_OPTIONS.some((entry) => entry.code === value.country) ? COUNTRY_OPTIONS : [{ code: value.country, name: value.country }, ...COUNTRY_OPTIONS]
  const citySuggestions = value.country === 'GH' && value.region ? GHANA_REGION_CITIES[value.region] ?? [] : []
  const set = (field: keyof VenueLocationValue, nextValue: string) => onChange({ ...value, [field]: nextValue })
  const setPin = (lat: number, lng: number) => {
    const pin = validPin(lat,lng)
    if (!pin) return
    onChange({ ...value, lat: String(pin.lat), lng: String(pin.lng), mapsUrl: mapsLink(pin) })
    setLinkError('')
    setMapOpen(false)
  }
  const readLink = () => {
    const link = value.mapsUrl.trim()
    if (!link) return
    const parsed = parseMapsCoordinate(link)
    if (!parsed) {
      setLinkError('The link was saved, but coordinates could not be extracted. To set the map pin, choose the point on the interactive map (short Google Maps links do not expose coordinates).')
      return
    }
    setPin(parsed.lat, parsed.lng)
  }

  return (
    <section className="space-y-4 rounded-xl border border-border/70 p-3 sm:p-4" aria-label="Venue location">
      <div>
        <h3 className="text-sm font-bold">Location and map</h3>
        <p className="mt-1 text-xs text-muted-foreground">Select the country and region, enter the town, and choose the venue’s exact position on the map.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="venue-country">Country *</Label>
          <select id="venue-country" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value.country}
            onChange={(e) => onChange({ ...value, country: e.target.value, region: '', city: '', lat: '', lng: '', mapsUrl: '' })}>
            {countryOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="venue-region">{value.country === 'GH' ? 'Region *' : 'Region / State / Province'}</Label>
          {value.country === 'GH' ? (
            <select id="venue-region" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value.region}
              onChange={(e) => onChange({ ...value, region: e.target.value, city: '' })}>
              <option value="">Select Ghana region</option>
              {value.region && !GHANA_REGIONS.includes(value.region) && <option value={value.region}>{value.region} (saved)</option>}
              {GHANA_REGIONS.map((region) => <option key={region} value={region}>{region} Region</option>)}
            </select>
          ) : (
            <Input id="venue-region" maxLength={60} value={value.region} onChange={(e) => set('region',e.target.value)} placeholder="Enter state or region" />
          )}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="venue-city">City / Town *</Label>
          <Input id="venue-city" required list="venue-city-suggestions" maxLength={60} value={value.city} onChange={(e) => set('city',e.target.value)}
            placeholder={value.country === 'GH' ? 'Choose a suggestion or type another town' : 'Enter city or town'} />
          <datalist id="venue-city-suggestions">{citySuggestions.map((city) => <option key={city} value={city} />)}</datalist>
          {value.country === 'GH' && <p className="text-xs text-muted-foreground">Common towns are suggested for the selected region; you can type any other locality.</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="venue-address">Street address / GhanaPost GPS</Label>
          <Input id="venue-address" maxLength={200} value={value.address} onChange={(e) => set('address',e.target.value)} placeholder="Building, street, area or digital address" />
        </div>
      </div>
      <div className="space-y-2 rounded-lg border border-border/70 bg-secondary/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Exact venue position</p>
            <p className="text-xs text-muted-foreground">Tap the map to place a pin; the coordinates and Google Maps link will be saved.</p>
          </div>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setMapOpen((current) => !current)}>
            <MapPin className="h-4 w-4" /> {mapOpen ? 'Hide map' : selected ? 'Change pin on map' : 'Select on map'}
          </Button>
        </div>
        {selected ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono">{selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}</span>
            <a href={mapsLink(selected)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline"><ExternalLink className="h-3.5 w-3.5" /> View in Google Maps app</a>
            <button type="button" className="inline-flex items-center gap-1 text-destructive underline" onClick={() => onChange({ ...value, lat: '', lng: '', mapsUrl: '' })}><Trash2 className="h-3 w-3" /> Clear pin</button>
          </div>
        ) : <p className="text-xs text-amber-700 dark:text-amber-300">No map pin selected yet. You can still enter a map link manually.</p>}
        {mapOpen && <VenueMapPicker initialPin={selected} country={value.country} region={value.region} onPick={(pin) => setPin(pin.lat, pin.lng)} onCancel={() => setMapOpen(false)} />}
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-[185px] flex-1" id="venue-maps-url" maxLength={300} type="url" value={value.mapsUrl} onChange={(e) => { set('mapsUrl',e.target.value); setLinkError('') }} placeholder="Optional Google Maps share link" />
          <Button type="button" size="sm" variant="outline" disabled={!value.mapsUrl.trim()} onClick={readLink}>Use link</Button>
        </div>
        {linkError && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{linkError}</p>}
      </div>
    </section>
  )
}
