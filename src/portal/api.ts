'use client'

/**
 * Typed API client for the iEventPlux v1 REST surface.
 * All requests are same-origin relative paths; errors carry stable codes.
 */

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public extra?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

/** A consistent, actionable explanation when a proxy or service returns no safe API message. */
const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: 'Some information was missing or invalid. Check your entries and try again.',
  401: 'Your sign-in details may be incorrect, or your session has expired. Please sign in again.',
  403: 'Your account does not have permission to complete this action. Contact your organizer or an administrator.',
  404: 'The requested item could not be found. It may have been removed or its link may have changed.',
  408: 'The request timed out. Check your connection and try again.',
  409: 'This information conflicts with an existing record. Review your entries and try again.',
  413: 'The file is too large. Choose a smaller file and try again.',
  422: 'Some details could not be accepted. Review the highlighted information and try again.',
  429: 'Too many attempts were made. Wait a moment before trying again.',
  500: 'Something went wrong on our server. Your changes may not have been saved. Try again shortly.',
  502: 'The service could not connect to its server. Please try again in a few minutes.',
  503: 'This service is temporarily unavailable. Please try again in a few minutes.',
  504: 'The server took too long to respond. Please try again shortly.',
}

export function apiErrorMessage(status: number, payload: unknown): string {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const object = payload as Record<string, unknown>
    const error = object.error
    const message = typeof error === 'object' && error !== null && !Array.isArray(error)
      ? (error as Record<string, unknown>).message
      : object.message
    // Use only a bounded, explicit JSON API message; never show proxy HTML, a stack trace or raw response text.
    if (typeof message === 'string' && message.trim() && message.length <= 500 && !/<[^>]+>/.test(message)) {
      return message.trim()
    }
  }
  return HTTP_ERROR_MESSAGES[status] ?? (status >= 500
    ? 'The service could not complete your request right now. Please try again later.'
    : 'We could not complete your request. Check your entries and try again.')
}

function apiErrorCode(status: number, payload: unknown): string {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const error = (payload as Record<string, unknown>).error
    const code = typeof error === 'string' ? error
      : error && typeof error === 'object' && !Array.isArray(error) ? (error as Record<string, unknown>).code : null
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(code)) return code
  }
  return `HTTP_${status}`
}

async function request<T>(method: string, path: string, body?: unknown, options?: { formData?: FormData; signal?: AbortSignal }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let payload: BodyInit | undefined
  if (options?.formData) {
    payload = options.formData
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(path.startsWith('/api') ? path : `/api/v1${path}`, {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
      signal: options?.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError('REQUEST_CANCELLED', 'This request was cancelled before it finished.', 0)
    }
    throw new ApiClientError('NETWORK_ERROR', 'Could not connect to iEventPlux. Check your internet connection and try again.', 0)
  }

  let data: unknown = null
  try {
    const text = await res.text()
    if (text) {
      try { data = JSON.parse(text) } catch { /* Non-JSON upstream responses use safe status explanations. */ }
    }
  } catch {
    throw new ApiClientError('NETWORK_ERROR', 'The connection was interrupted while receiving the response. Check your internet connection and try again.', 0)
  }

  if (!res.ok) {
    const message = apiErrorMessage(res.status, data)
    const retryAfter = res.headers.get('retry-after')
    const retrySeconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null
    const advice = res.status === 429 && retrySeconds && retrySeconds <= 3600
      ? `${message} You can retry in ${retrySeconds} seconds.` : message
    const extra = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : undefined
    const requestId = res.headers.get('x-correlation-id')
    const explanation = res.status >= 500 && requestId
      ? `${advice} If this continues, contact support with reference ${requestId}.` : advice
    throw new ApiClientError(apiErrorCode(res.status, data), explanation, res.status, extra)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, options?: { signal?: AbortSignal }) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, formData: FormData) => request<T>('POST', path, undefined, { formData }),
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}
