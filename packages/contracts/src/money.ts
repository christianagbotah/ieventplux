/** Money is always integer minor units (GHS pesewas). Never floats in arithmetic. */
export const CURRENCY_MINOR_DIGITS: Record<string, number> = { GHS: 2, USD: 2, EUR: 2, GBP: 2, NGN: 2, XOF: 0 };
export function minorToMajorString(minor: number | bigint, currency = 'GHS'): string {
  const digits = CURRENCY_MINOR_DIGITS[currency] ?? 2;
  const n = BigInt(minor); const neg = n < 0n; const abs = neg ? -n : n; const base = 10n ** BigInt(digits);
  const whole = abs / base; const frac = (abs % base).toString().padStart(digits, '0');
  return `${neg ? '-' : ''}${whole}${digits ? '.' + frac : ''}`;
}
/** Ghana display: GH₵1,234.50 — symbol, two decimals, thousands separators. */
export function formatMoney(minor: number | bigint, currency = 'GHS', locale = 'en-GH'): string {
  const digits = CURRENCY_MINOR_DIGITS[currency] ?? 2;
  const major = Number(minorToMajorString(minor, currency));
  const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(major);
  const symbol = currency === 'GHS' ? 'GH₵' : currency + ' ';
  return `${symbol}${formatted}`;
}
/** Provider APIs take major-unit decimals (e.g. Hubtel totalAmount). Exact string conversion, parsed once at the boundary. */
export function minorToProviderAmount(minor: number, currency = 'GHS'): number { return Number(minorToMajorString(minor, currency)); }
export function providerAmountToMinor(amount: number | string, currency = 'GHS'): number {
  const digits = CURRENCY_MINOR_DIGITS[currency] ?? 2; const s = String(amount);
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error('Invalid provider amount');
  const [w, f = ''] = s.split('.'); if (f.length > digits) throw new Error('Provider amount has more precision than currency allows');
  return Number(w) * 10 ** digits + (f ? Number(f.padEnd(digits, '0')) : 0) * (s.startsWith('-') ? -1 : 1);
}
/** Percentage in basis points of a percent (pct * 100 stored as Int) → rounded half-up minor amount. */
export function applyPct(minor: number, pct: number): number { return Math.round((minor * pct) / 100); }
