import {expect,test} from 'bun:test'
import {eventTimeLabel,personRoleLabel,programmeDocumentPath,sortedAgenda,availableSouvenirStock,isPhotoGalleryUrl} from './event-programme'

test('lineup roles match the web event detail labels',()=>{
  expect(personRoleLabel('MAIN_SPEAKER')).toBe('Main speaker')
  expect(personRoleLabel('ASSISTANT_SPEAKER')).toBe('Assistant speaker')
  expect(personRoleLabel('HEADLINER')).toBe('Headline artist')
  expect(personRoleLabel('SPECIAL_GUEST')).toBe('Special guest')
  expect(personRoleLabel('NEW_ROLE')).toBe('New Role')
})
test('agenda shows the event configured timezone instead of assuming device timezone',()=>{
  const iso='2026-11-24T15:30:00.000Z'
  expect(eventTimeLabel(iso,'Africa/Accra')).toContain('15:30')
  expect(eventTimeLabel(iso,'Europe/London')).toContain('15:30')
  expect(eventTimeLabel(iso,'America/New_York')).toContain('10:30')
  expect(eventTimeLabel('bad-date','Africa/Accra')).toBe('Time to be announced')
})
test('agenda preserves authoritative sequence and souvenir availability is honest',()=>{
  const items=[{id:'1',title:'Opening',startsAt:'2026-11-24T15:00:00Z'}, {id:'2',title:'Keynote',startsAt:'2026-11-24T16:00:00Z'}]
  expect(sortedAgenda(items).map(x=>x.id)).toEqual(['1','2'])
  expect(availableSouvenirStock(0)).toBe('Currently out of stock')
  expect(availableSouvenirStock(1234)).toBe('1,234 listed in stock')
})
test('programme PDFs stay inside the gated same-origin route',()=>{
  expect(programmeDocumentPath('ev123','pdf123')).toBe('/api/v1/events/ev123/programmes/pdf123')
  expect(programmeDocumentPath('abc/def','file?bad=1')).toBe('/api/v1/events/abc%2Fdef/programmes/file%3Fbad%3D1')
})

test('gallery does not render known video clips as broken images',()=>{
  expect(isPhotoGalleryUrl('https://cdn.example.com/clip.mp4')).toBe(false)
  expect(isPhotoGalleryUrl('/media/video.webm?auth=abc')).toBe(false)
  expect(isPhotoGalleryUrl('/media/banner.webp')).toBe(true)
  expect(isPhotoGalleryUrl('/media/gallery/123')).toBe(true)
})
