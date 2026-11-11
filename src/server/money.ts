/**
 * Money handling. All amounts are integer minor units (GHS pesewas) end-to-end.
 * Never floating point. Display: ₵1,234.56 (cedi symbol, 2 decimals, thousands separators).
 */

export const SUPPORTED_CURRENCIES = ['GHS'] as const
export type Currency = (typeof SUPPORTED_CURRENCIES)[number]

export function cedisToMinor(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid amount')
  return Math.round(amount * 100)
}

export function formatMoney(minor: number, currency: string = 'GHS'): string {
  const symbol = currency === 'GHS' ? '₵' : currency === 'USD' ? '$' : `${currency} `
  const negative = minor < 0
  const abs = Math.abs(minor)
  const whole = Math.floor(abs / 100)
  const cents = String(abs % 100).padStart(2, '0')
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '−' : ''}${symbol}${grouped}.${cents}`
}

export function formatMoneyPlain(minor: number, currency: string = 'GHS'): string {
  const code = currency === 'GHS' ? 'GHS' : currency
  return `${code} ${(minor / 100).toFixed(2)}`
}

/** Commission in basis points → minor units, rounded half up. */
export function bpOf(amountMinor: number, basisPoints: number): number {
  return Math.round((amountMinor * basisPoints) / 10000)
}

export function pctString(basisPoints: number): string {
  const v = basisPoints / 100
  return `${Number.isInteger(v) ? v : v.toFixed(2)}%`
}
