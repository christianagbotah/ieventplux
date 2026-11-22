/** Only public event IDs can be requested for a comparison. */
export const MAX_COMPARE_EVENTS = 3

export function parseCompareIds(raw: string | null): string[] {
  if (!raw || raw.length > 400) throw new Error('Select between one and three events to compare.')
  const ids = raw.split(',').map((id) => id.trim())
  if (ids.length < 1 || ids.length > MAX_COMPARE_EVENTS ||
      ids.some((id) => !/^[a-zA-Z0-9_-]{8,128}$/.test(id)) ||
      new Set(ids).size !== ids.length) {
    throw new Error('Comparison links must contain one to three different valid event IDs.')
  }
  return ids
}

/** Share only public event IDs, never names, contact details or private tickets. */
export function comparePath(ids: string[]): string {
  const validated = parseCompareIds(ids.join(','))
  return '/compare?ids=' + encodeURIComponent(validated.join(','))
}
