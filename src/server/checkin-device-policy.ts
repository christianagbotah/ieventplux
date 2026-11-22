import { orgCan } from './permissions'

/** Staff can manage their own scanner session; event editors can manage all
 * sessions for their own event. Permission still requires event membership. */
export function mayManageScannerSession(
  role: string, currentUserId: string, sessionOwnerId: string,
): boolean {
  return Boolean(currentUserId && sessionOwnerId) &&
    (currentUserId === sessionOwnerId || orgCan(role, 'event:edit'))
}

export function scannerLabel(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const name = input.trim()
  if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) return null
  return name
}
