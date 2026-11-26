/** Account-scoped invalidation only. Never publish private notification contents. */
const subscribers = new Map<string, Set<() => void>>()
export function subscribeActivity(userId: string, listener: () => void): () => void {
 const listeners = subscribers.get(userId) ?? new Set<() => void>()
 listeners.add(listener)
 subscribers.set(userId, listeners)
 return () => {
  listeners.delete(listener)
  if (!listeners.size) subscribers.delete(userId)
 }
}
export function invalidateActivity(userId: string) {
 for (const listener of [...(subscribers.get(userId) ?? [])]) listener()
}
