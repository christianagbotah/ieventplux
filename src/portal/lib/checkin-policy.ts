import { ApiClientError } from '../api'

/**
 * Only a connectivity failure may be queued for later check-in verification.
 * A returned HTTP response (including 400/401/403/409/429/500) is a server
 * decision: retrying it as an offline admission is incorrect and unsafe.
 */
export function scanMayQueueOffline(error: unknown, online: boolean): boolean {
  // The API client wraps fetch transport errors as status-0 NETWORK_ERROR.
  // Never treat a server HTTP response, cancelled request or local programming
  // error as evidence of a safe offline scan.
  if (error instanceof ApiClientError) return error.status === 0 && error.code === 'NETWORK_ERROR'
  return error instanceof TypeError || (!online && error instanceof Error && error.message === 'Browser offline')
}
