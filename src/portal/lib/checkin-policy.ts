import { ApiClientError } from '../api'

/**
 * Only a connectivity failure may be queued for later check-in verification.
 * A returned HTTP response (including 400/401/403/409/429/500) is a server
 * decision: retrying it as an offline admission is incorrect and unsafe.
 */
export function scanMayQueueOffline(error: unknown, online: boolean): boolean {
  if (error instanceof ApiClientError) return false
  return !online || error instanceof TypeError
}
