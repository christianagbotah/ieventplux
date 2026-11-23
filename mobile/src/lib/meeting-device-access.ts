/** Shared, side-effect-free rules for a secure native-to-browser meeting handoff. */
export function nativePermissionStatus(granted?: boolean, canAskAgain?: boolean): string {
  if (granted) return 'Allowed'
  if (canAskAgain === false) return 'Blocked in system settings'
  return 'Not granted'
}

export function secureMeetingUrl(base: string | null, id: string): string | null {
  if (!base || !/^[a-zA-Z0-9_-]{8,128}$/.test(id)) return null
  try {
    const parsed = new URL(base)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null
    return parsed.origin + '/#/meeting/' + encodeURIComponent(id)
  } catch { return null }
}
