'use client'

import { useEffect, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import { LocateFixed, MapPinned, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GHANA_REGION_MAP_CENTERS, mapsLink, parseMapsCoordinate, type VenuePin, validPin } from '../lib/venue-locations'
import 'leaflet/dist/leaflet.css'

/** Location is picked in-app, not inferred from a third-party app's URL or a user's IP.
 * Opening Google Maps is optional; its app cannot write a location back into this form.
 */
export function VenueMapPicker({ initialPin, onPick, onCancel, country, region }: {
  initialPin: VenuePin | null
  onPick: (pin: VenuePin) => void
  onCancel: () => void
  country: string
  region?: string
}) {
  const holder = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Leaflet.Map | null>(null)
  const markerRef = useRef<Leaflet.Marker | null>(null)
  const libRef = useRef<typeof Leaflet | null>(null)
  const [pin, setPin] = useState<VenuePin | null>(initialPin)
  const [mapError, setMapError] = useState('')
  const [locating, setLocating] = useState(false)
  const [shared, setShared] = useState('')
  const pinIcon = useRef<Leaflet.DivIcon | null>(null)

  const setPosition = (next: VenuePin, zoom = 16) => {
    setPin(next)
    const lib = libRef.current
    const map = mapRef.current
    if (lib && map) {
      if (markerRef.current) markerRef.current.setLatLng([next.lat, next.lng])
      else {
        markerRef.current = lib.marker([next.lat, next.lng], { draggable: true, autoPan: true, icon: pinIcon.current ?? undefined }).addTo(map)
        markerRef.current.on('dragend', () => {
          const moved = markerRef.current?.getLatLng()
          if (moved) setPin(validPin(moved.lat, moved.lng))
        })
      }
      map.setView([next.lat, next.lng], zoom)
    }
  }

  useEffect(() => {
    let disposed = false
    let map: Leaflet.Map | null = null
    void import('leaflet').then((L) => {
      if (disposed || !holder.current) return
      libRef.current = L
      pinIcon.current = L.divIcon({ className: 'ievx-venue-map-marker', html: '<span style="display:block;font-size:30px;line-height:36px;filter:drop-shadow(0 2px 2px #333)">📍</span>', iconSize: [36,36], iconAnchor: [16,35] })
      const regionCenter = country === 'GH' && region ? GHANA_REGION_MAP_CENTERS[region] : undefined
      const start = initialPin ?? regionCenter ?? (country === 'GH' ? { lat: 7.95, lng: -1.02 } : { lat: 12, lng: 0 })
      map = L.map(holder.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true })
        .setView([start.lat, start.lng], initialPin ? 16 : regionCenter ? 11 : country === 'GH' ? 7 : 2)
      mapRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        minZoom: 2, maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
      }).addTo(map)
      const placePin = (coords: Leaflet.LatLng) => {
        const point = validPin(coords.lat, coords.lng)
        if (!point || !map) return
        if (markerRef.current) markerRef.current.setLatLng(coords)
        else markerRef.current = L.marker(coords, { draggable: true, autoPan: true, icon: pinIcon.current ?? undefined }).addTo(map)
        setPin(point)
        markerRef.current.off('dragend')
        markerRef.current.on('dragend', () => {
          const moved = markerRef.current?.getLatLng()
          if (moved) setPin(validPin(moved.lat, moved.lng))
        })
      }
      if (initialPin) placePin(L.latLng(initialPin.lat, initialPin.lng))
      map.on('click', (event: Leaflet.LeafletMouseEvent) => placePin(event.latlng))
      window.setTimeout(() => { if (!disposed) map?.invalidateSize() }, 100)
    }).catch(() => { if (!disposed) setMapError('The interactive map could not load. You can still paste a Google Maps coordinate link.') })
    return () => {
      disposed = true
      if (map) map.remove()
      mapRef.current = null
      markerRef.current = null
      libRef.current = null
      pinIcon.current = null
    }
    // A fresh picker is mounted each time the organizer opens the map.
  }, [])

  const useLocation = () => {
    if (!navigator.geolocation) return setMapError('This browser does not support location access. Select a location by tapping the map instead.')
    setLocating(true)
    setMapError('')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = validPin(coords.latitude, coords.longitude)
        if (next) setPosition(next)
        setLocating(false)
      },
      () => { setMapError('Location permission was denied or timed out. Choose the location on the map instead.'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }

  const fromSharedLink = () => {
    const point = parseMapsCoordinate(shared)
    if (!point) return setMapError('Paste coordinates (e.g. 5.603717,-0.186964) or a full Google Maps URL containing coordinates. Short links cannot be read automatically; tap the map instead.')
    setMapError('')
    setPosition(point)
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-secondary/20 p-3" role="region" aria-label="Choose venue location on a map">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold"><MapPinned className="h-4 w-4 text-primary" /> Choose a precise map location</p>
          <p className="text-xs text-muted-foreground">Zoom and tap the building or venue. Drag the pin to adjust it.</p>
        </div>
        <Button size="sm" type="button" variant="outline" onClick={useLocation} disabled={locating}>
          {locating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-1 h-4 w-4" />} Use my location
        </Button>
      </div>
      <div ref={holder} className="h-[290px] w-full overflow-hidden rounded-lg border bg-muted sm:h-[365px]" aria-label="Interactive venue map" />
      <p className="text-xs text-muted-foreground">Map tiles © OpenStreetMap contributors. GPS is only requested when you tap “Use my location.”</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">Selected coordinates:</span>
        {pin ? <span className="font-mono">{pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}</span> : <span className="text-muted-foreground">Tap the map to set a pin</span>}
        {pin && <a className="inline-flex items-center gap-1 text-primary underline" href={mapsLink(pin)} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" /> Open in Google Maps app</a>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-[180px] flex-1" aria-label="Coordinates or Google Maps URL" value={shared} onChange={(e) => setShared(e.target.value)} placeholder="Or paste coordinates / Google Maps link" />
        <Button type="button" size="sm" variant="outline" disabled={!shared.trim()} onClick={fromSharedLink}>Find on map</Button>
      </div>
      {mapError && <p role="alert" className="text-xs text-destructive">{mapError}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Close map</Button>
        <Button type="button" size="sm" disabled={!pin} onClick={() => pin && onPick(pin)}>Use selected location</Button>
      </div>
    </div>
  )
}
