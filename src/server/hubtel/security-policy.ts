/** Pure production payment gates. Do not infer real money movement from a callback. */
export function simulatorAllowed(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'production'
}

/** A missing amount is NOT confirmation. All monetary values are integer pesewas. */
export function confirmedAmountMatches(receivedMinor: number | null, expectedMinor: number): boolean {
  return typeof receivedMinor === 'number' &&
    Number.isSafeInteger(receivedMinor) &&
    Number.isSafeInteger(expectedMinor) &&
    receivedMinor === expectedMinor &&
    expectedMinor >= 0
}

/** The example .env value must NEVER be accepted as a real production signing key. */
export function productionSecretConfigured(secret: string | undefined): boolean {
  if (!secret || secret.length < 32) return false
  return !/dev-only|change-me|changeme|placeholder|dummy/i.test(secret)
}
