import { describe, expect, test } from 'bun:test'
import { merchandiseReportCsv, safeCsvCell } from './merchandise-reconciliation'

describe('safe souvenir reconciliation export', () => {
  test('CSV formula injection is escaped including whitespace-prefix bypasses', () => {
    for (const unsafe of ['=2+2', '+HYPERLINK(1)', '-SUM(1)', '@sum', '  =2+2', '\t=3', '\uFEFF=1+1', '\u200B=1+1', '\u202E=1+1', '\u2060+1']) {
      expect(safeCsvCell(unsafe)).toStartWith('"\'')
    }
    expect(safeCsvCell('Normal event')).toBe('"Normal event"')
    expect(safeCsvCell('Ticket "Gold", black')).toBe('"Ticket ""Gold"", black"')
    expect(safeCsvCell('Line\r\nbreak')).toBe('"Line  break"')
  })
  test('non-finance exports have no revenue columns or values', () => {
    const base = {
      event: { title: '=2+2', id: 'evt1', status: 'PUBLISHED', startsAt: new Date() },
      events: [], eventId: 'evt1', totalProducts: 1, shownProducts: 1, recentCollections: [],
      totals: { paidOrders: 1, paidQty: 1, collectedQty: 0, outstandingQty: 1, reservedQty: 0, stockQty: 5, salesMinor: null },
      items: [{ id: 'p1', sku: '=SUSPICIOUS', name: 'T Shirt', variantLabel: 'XL', active: true,
        stockTotal: 5, stockReserved: 0, stockSold: 1, stockFulfilled: 0, availableQty: 4,
        paidQty: 1, collectedQty: 0, outstandingQty: 1, salesMinor: null }],
    }
    const output = merchandiseReportCsv(base)
    expect(output).not.toContain('Paid merchandise sales')
    expect(output).toContain("'=SUSPICIOUS")
    expect(output).toContain("'=2+2")
    const finance = merchandiseReportCsv({ ...base, totals: { ...base.totals, salesMinor: 4500 },
      items: base.items.map((row) => ({ ...row, salesMinor: 4500 })) })
    expect(finance).toContain('Paid merchandise sales')
    expect(finance).toContain('₵45.00')
  })
})
