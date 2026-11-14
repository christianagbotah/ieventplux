/**
 * Key-value storage adapter shared by the offline mobile libraries
 * (checkin-offline.ts, ticket-wallet.ts).
 *
 * The surface is exactly the subset of AsyncStorage those libraries call:
 * getItem / setItem / getAllKeys / multiRemove. AsyncStorage satisfies it
 * structurally, so inside the React Native app the libraries keep running
 * against the real store with no wrapper and no behavior change.
 *
 * Why an adapter exists at all: both libraries used to import
 * `@react-native-async-storage/async-storage` at module top level (and
 * checkin-offline additionally the api client, whose expo-constants /
 * expo-secure-store imports drag in react-native). That import chain cannot
 * even be parsed by Bun, so `bun test` could never load the pure logic.
 * The libraries now resolve their store (and transport) lazily and accept an
 * injected override via their set*Store()/setOfflineTransport() seams —
 * unit tests inject this Map-backed fake, the app gets the AsyncStorage
 * default. Nothing outside the storage seam changes.
 */

export interface KVStore {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  getAllKeys(): Promise<readonly string[]>
  multiRemove(keys: readonly string[]): Promise<void>
}

let cachedDefault: KVStore | null = null

/**
 * Resolve the React Native default storage. The import is dynamic on purpose:
 * evaluating THIS module must never pull react-native, so `bun test` can load
 * the offline libraries without a device — only code paths that actually run
 * without an injected store ever touch AsyncStorage (and the app always runs
 * those paths, so the runtime contract there is unchanged).
 *
 * The `.default ?? candidate` fallback covers both shapes a bundler can hand
 * back for `import()`: a real ES namespace (AsyncStorage on `.default`) or raw
 * CommonJS exports (Metro's async require may return the exports object
 * itself for a non-ESM target).
 */
export async function loadDefaultKVStore(): Promise<KVStore> {
  if (cachedDefault) return cachedDefault
  const mod: unknown = await import('@react-native-async-storage/async-storage')
  const candidate = mod as { default?: KVStore } & KVStore
  cachedDefault = candidate.default ?? candidate
  return cachedDefault
}
