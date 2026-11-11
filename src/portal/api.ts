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
  }
}

async function request<T>(method: string, path: string, body?: unknown, options?: { formData?: FormData }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let payload: BodyInit | undefined
  if (options?.formData) {
    payload = options.formData
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(path.startsWith('/api') ? path : `/api/v1${path}`, {
    method,
    headers,
    body: payload,
    credentials: 'same-origin',
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } })?.error
    throw new ApiClientError(err?.code ?? 'NETWORK', err?.message ?? `Request failed (${res.status})`, res.status, data as Record<string, unknown>)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
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
