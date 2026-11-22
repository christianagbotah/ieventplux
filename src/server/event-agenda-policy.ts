/** Authoritative event-agenda slot rules. Never trust client-provided dates,
 * sort order or descriptions. The persisted API stores UTC instants.
 */
import { errors, sanitizeText } from './api'

type AgendaFields = Record<string, unknown>

function agendaDate(value: unknown, name: string, required: boolean): Date | null {
  if (value === null || value === undefined || value === '') {
    if (required) throw errors.badRequest(`${name} date and time are required.`)
    return null
  }
  if (typeof value !== 'string' && !(value instanceof Date)) throw errors.badRequest(`${name} must be an ISO date-time.`)
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw errors.badRequest(`${name} must be a UTC ISO date-time.`)
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw errors.badRequest(`${name} must be a valid date and time.`)
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value)
    if (!match || date.getUTCFullYear() !== Number(match[1]) ||
        date.getUTCMonth() + 1 !== Number(match[2]) ||
        date.getUTCDate() !== Number(match[3]) ||
        date.getUTCHours() !== Number(match[4]) ||
        date.getUTCMinutes() !== Number(match[5]) ||
        date.getUTCSeconds() !== Number(match[6])) {
      throw errors.badRequest(`${name} must be a valid date and time.`)
    }
  }
  return date
}

export function agendaItemPayload(body: AgendaFields) {
  const title = sanitizeText(body.title, 160)
  if (title.trim().length < 2) throw errors.badRequest('Enter an agenda item title (at least 2 characters).')
  const startsAt = agendaDate(body.startsAt, 'Agenda start', true)!
  const endsAt = agendaDate(body.endsAt, 'Agenda finish', false)
  if (endsAt && endsAt <= startsAt) throw errors.badRequest('Agenda finish must be after the start.')
  const rawOrder = body.sortOrder === undefined ? 0 : body.sortOrder
  if (rawOrder === null || rawOrder === '' || typeof rawOrder === 'boolean') throw errors.badRequest('Display order must be a whole number.')
  const sortOrder = Number(rawOrder)
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000) {
    throw errors.badRequest('Display order must be a whole number between 0 and 1,000.')
  }
  return {
    title, startsAt, endsAt,
    speaker: sanitizeText(body.speaker, 120) || null,
    description: sanitizeText(body.description, 500) || null,
    sortOrder,
  }
}
