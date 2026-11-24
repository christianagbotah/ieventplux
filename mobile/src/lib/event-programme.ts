/** Presentation-only programme helpers. Do not infer unpublished/private media. */
import type { EventAgendaItem, EventContributor, EventDetail } from '../api/client'

export const LINEUP_ROLE_LABELS: Readonly<Record<string,string>> = {
  HEADLINER: 'Headline artist', ARTIST: 'Performer', MAIN_SPEAKER: 'Main speaker',
  ASSISTANT_SPEAKER: 'Assistant speaker', GUEST_SPEAKER: 'Invited speaker',
  SPECIAL_GUEST: 'Special guest', PANELIST: 'Panelist',
  MC: 'Master of ceremonies', DJ: 'DJ', HOST: 'Host',
}
export function personRoleLabel(role: string): string {
  return LINEUP_ROLE_LABELS[role] ?? role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c=>c.toUpperCase())
}

export function eventTimeLabel(iso: string, timeZone: string): string {
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return 'Time to be announced'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone, day:'numeric', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit', hour12:false,
    }).format(when)
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone:'UTC', day:'numeric', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit', hour12:false,
    }).format(when) + ' UTC'
  }
}
export function sortedAgenda(items: EventAgendaItem[]): EventAgendaItem[] {
  // The API provides sortOrder-first order; preserve it and don't silently
  // recalculate a different programme on a user's phone.
  return items
}
export function publishedLineup(event: EventDetail): EventContributor[] {
  return event.contributors ?? []
}
export function availableSouvenirStock(total: number): string {
  return total > 0 ? `${total.toLocaleString('en-US')} listed in stock` : 'Currently out of stock'
}
export function programmeDocumentPath(eventId: string, documentId: string): string {
  // Never follow a document URL supplied by arbitrary API metadata. The server
  // enforces RSVP/organization access on this exact same-origin PDF endpoint.
  return `/api/v1/events/${encodeURIComponent(eventId)}/programmes/${encodeURIComponent(documentId)}`
}

/** Clip media can appear in the API gallery. Do not pass known video URLs to
 * the image renderer; verified video playback belongs in the media viewer. */
export function isPhotoGalleryUrl(url: string): boolean {
  return !/\.(mp4|webm|mov|m4v|m3u8)(?:[?#]|$)/i.test(url)
}
