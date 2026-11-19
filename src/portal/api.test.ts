import { describe, expect, test } from 'bun:test'
import { api, ApiClientError, apiErrorMessage } from './api'

describe('system-wide API error messages', () => {
  test('preserves helpful server validation and conflict messages', () => {
    expect(apiErrorMessage(400, { error: { code: 'BAD_REQUEST', message: 'Enter a valid email address.' } })).toBe('Enter a valid email address.')
    expect(apiErrorMessage(409, { error: { code: 'CONFLICT', message: 'An account with this email already exists.' } })).toContain('already exists')
  })

  test('understands legacy reverse proxy errors with a string code', () => {
    expect(apiErrorMessage(503, { error: 'REGISTRATION_NOT_OPEN', message: 'Registrations will open after platform setup is complete.' })).toContain('Registrations will open')
  })

  test('non-JSON or HTML upstream errors receive an actionable safe message', () => {
    expect(apiErrorMessage(503, '<html>bad gateway</html>')).toContain('temporarily unavailable')
    expect(apiErrorMessage(502, { error: { message: '<pre>secret traceback</pre>' } })).toContain('could not connect')
    expect(apiErrorMessage(429, null)).toContain('Too many attempts')
  })

  test('surfaces useful status and request reference when service fails', async () => {
    const previous = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code: 'DATABASE_UNAVAILABLE', message: 'The database is temporarily unavailable.' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': 'test-reference' },
    })) as unknown as typeof fetch
    try {
      await expect(api.post('/auth/register', {})).rejects.toMatchObject({
        code: 'DATABASE_UNAVAILABLE', status: 503,
      })
      try {
        await api.post('/auth/register', {})
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError)
        expect((error as ApiClientError).message).toContain('reference test-reference')
      }
    } finally {
      globalThis.fetch = previous
    }
  })

  test('network failures explain connectivity rather than showing raw fetch errors', async () => {
    const previous = globalThis.fetch
    globalThis.fetch = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    try {
      await expect(api.get('/events')).rejects.toMatchObject({
        code: 'NETWORK_ERROR', status: 0, message: 'Could not connect to iEventPlux. Check your internet connection and try again.',
      })
    } finally {
      globalThis.fetch = previous
    }
  })
})
