import { describe, expect, test } from 'bun:test'
import { quoteTicketSelection, ticketCheckoutSupported, ticketAvailability, hasPaidAdmissionSelection, type TicketQuote } from './ticket-selection'

const gh: TicketQuote = {
  id: 'ga', priceMinor: 3000, currency: 'GHS',
  perBuyerLimit: 4, quota: 100, soldCount: 5, reservedCount: 1,
}
const eu: TicketQuote = {
  id: 'eu', priceMinor: 4500, currency: 'EUR',
  perBuyerLimit: 2, quota: 100, soldCount: 0, reservedCount: 0,
}
const free: TicketQuote = {
  id: 'free', priceMinor: 0, currency: 'USD',
  perBuyerLimit: 5, quota: 0, soldCount: 0, reservedCount: 0,
}

describe('event ticket selection safety and trust', () => {
  test('foreign free tickets allowed but foreign paid checkout not implied', () => {
    expect(ticketCheckoutSupported(free)).toBe(true)
    expect(ticketCheckoutSupported(gh)).toBe(true)
    expect(ticketCheckoutSupported(eu)).toBe(false)
  })
  test('honors quota less prior sales/reservations and per-buyer limits', () => {
    expect(ticketAvailability(gh)).toBe(4)
    expect(ticketAvailability({ ...gh, quota: 8 })).toBe(2)
    expect(ticketAvailability({ ...gh, quota: 5 })).toBe(0)
    expect(ticketAvailability(free)).toBe(5)
  })
  test('quotes base GHS subtotal and keeps free tickets free', () => {
    expect(quoteTicketSelection([gh, free], { ga: 2, free: 1 })).toEqual({
      count: 3, subtotalMinor: 6000, unsupported: false, invalid: false,
    })
  })
  test('quotes existing group discount in minor units', () => {
    const group: TicketQuote = { ...gh, priceMinor: 4000, groupMinQty: 3, groupPctOff: 25 }
    expect(quoteTicketSelection([group], { ga: 3 }).subtotalMinor).toBe(9000)
  })
  test('never combines USD/EUR payable lines with GHS', () => {
    const result = quoteTicketSelection([gh, eu], { ga: 1, eu: 1 })
    expect(result).toEqual({ count: 1, subtotalMinor: 3000, unsupported: true, invalid: false })
  })
  test('rejects oversubscription, fractional and unsafe quantities', () => {
    expect(quoteTicketSelection([gh], { ga: 5 }).invalid).toBe(true)
    expect(quoteTicketSelection([gh], { ga: 1.2 }).invalid).toBe(true)
    expect(quoteTicketSelection([gh], { ga: -1 }).invalid).toBe(true)
    expect(quoteTicketSelection([gh], { ga: Number.MAX_SAFE_INTEGER }).invalid).toBe(true)
  })
  test('rejects unsupported paid amounts and invalid ticket prices', () => {
    expect(ticketCheckoutSupported({ priceMinor: -1, currency: 'GHS' })).toBe(false)
    expect(ticketCheckoutSupported({ priceMinor: 12.5, currency: 'GHS' })).toBe(false)
    expect(ticketCheckoutSupported({ priceMinor: 300, currency: 'USD' })).toBe(false)
  })
})


describe('paid versus free basket UX admission rules', () => {
  const types = [{ id: 'free', priceMinor: 0 }, { id: 'paid', priceMinor: 1200 }]
  test('a free RSVP does not become a paid checkout when the event also offers paid tickets', () => {
    expect(hasPaidAdmissionSelection(types, { free: 2, paid: 0 })).toBe(false)
    expect(hasPaidAdmissionSelection(types, { free: 0, paid: 0 })).toBe(false)
  })
  test('a basket with at least one priced ticket is a paid checkout', () => {
    expect(hasPaidAdmissionSelection(types, { free: 1, paid: 1 })).toBe(true)
  })
})
