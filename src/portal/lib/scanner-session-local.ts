/** Only a nonsecret reference is saved locally, scoped by user/org/event.
 * The actual device token and its hashed secret must never be cached here. */
export function scannerSessionKey(userId: string, orgId: string, eventId: string): string {
  if (!userId || !orgId || !eventId) throw new Error('Scanner scope is missing.')
  return 'ievx-scanner-session:' + JSON.stringify([userId, orgId, eventId])
}
