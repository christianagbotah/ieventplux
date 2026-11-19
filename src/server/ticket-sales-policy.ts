/** Pure validation of organizer-controlled pricing/sales windows.
 * Checkout remains authoritative for sellability, caps and discounts.
 */
import { errors } from './api'

export function boundedInt(value: unknown, field: string, min: number, max: number): number {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') throw errors.badRequest(`${field} is required.`)
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < min || number > max) throw errors.badRequest(`${field} must be a whole number between ${min} and ${max}.`)
  return number
}

function parsedDate(value: unknown, label: string): Date | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || !value.trim()) throw errors.badRequest(`${label} must be a valid date/time.`)
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw errors.badRequest(`${label} must be a valid date/time.`)
  return date
}

export interface TicketSalesSettings {
  perBuyerLimit: number
  saleStartsAt: Date | null
  saleEndsAt: Date | null
  groupMinQty: number | null
  groupPctOff: number | null
}

export function ticketSalesSettings(
  input: Record<string, unknown>,
  previous?: TicketSalesSettings,
  priceMinor = 0,
): TicketSalesSettings {
  const perBuyerLimit = input.perBuyerLimit === undefined
    ? (previous?.perBuyerLimit ?? 4)
    : boundedInt(input.perBuyerLimit, 'Maximum tickets per buyer', 1, 10)
  const saleStartsAt = input.saleStartsAt === undefined ? previous?.saleStartsAt ?? null : parsedDate(input.saleStartsAt, 'Sales opening')
  const saleEndsAt = input.saleEndsAt === undefined ? previous?.saleEndsAt ?? null : parsedDate(input.saleEndsAt, 'Sales closing')
  if (saleStartsAt && saleEndsAt && saleStartsAt >= saleEndsAt) throw errors.badRequest('Sales closing time must be after the opening time.')

  let groupMinQty = input.groupMinQty === undefined ? previous?.groupMinQty ?? null : input.groupMinQty === null || input.groupMinQty === '' ? null : boundedInt(input.groupMinQty, 'Group minimum quantity', 2, 10)
  let groupPctOff = input.groupPctOff === undefined ? previous?.groupPctOff ?? null : input.groupPctOff === null || input.groupPctOff === '' ? null : boundedInt(input.groupPctOff, 'Group discount percentage', 1, 90)
  if (groupMinQty === null && groupPctOff === null) {
    // No group discount configured.
  } else if (groupMinQty === null || groupPctOff === null) {
    throw errors.badRequest('Set both the group minimum quantity and group discount percentage, or clear both.')
  } else {
    if (groupMinQty > perBuyerLimit) throw errors.badRequest('Group minimum cannot exceed the per-buyer ticket limit.')
    if (priceMinor === 0) throw errors.badRequest('Group discounts cannot be applied to free ticket types.')
  }
  return { perBuyerLimit, saleStartsAt, saleEndsAt, groupMinQty, groupPctOff }
}
