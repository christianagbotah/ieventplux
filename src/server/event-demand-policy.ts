/** Demand and reminder rules shared by HTTP and the periodic worker.
 * Drafts and scheduled publications must not accept public demand yet.
 * Invitation-only notifications require current, not historical, admission.
 */
export function demandIsOpen(event: { status: string; startsAt: Date; deletedAt: Date | null }, now: Date) {
  return !event.deletedAt && event.status === 'PUBLISHED' && event.startsAt > now
}

export function hasDemandEntitlement(visibility: string, evidence: { userId?: string | null; approvedRsvp?: boolean; validTicket?: boolean }) {
  return visibility !== 'INVITE_ONLY' || Boolean(evidence.userId && (evidence.approvedRsvp || evidence.validTicket))
}

export function reminderNotice(visibility: string, title: string, ticketHolder: boolean) {
  if (visibility === 'INVITE_ONLY') return {
    title: 'Private event starting soon',
    body: 'Your event starts within 24 hours. Sign in to view the current details.',
  }
  return ticketHolder ? { title: 'Coming up: ' + title, body: 'Your event starts within 24 hours.' }
    : { title: 'Starting soon: ' + title, body: 'This event starts within 24 hours — grab a ticket while some are left.' }
}

export function waitlistNotice(visibility: string, title: string, when: string) {
  return visibility === 'INVITE_ONLY'
    ? { title: 'Private event availability', body: 'Sign in to check current availability. No reservation is held for you.' }
    : { title: 'Tickets just opened up', body: title + ' (' + when + ') has tickets available again. First come, first served — nothing is held for you, so book soon.' }
}
