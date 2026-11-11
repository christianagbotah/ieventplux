'use client'

/** Client-side formatters (cedi symbol, thousands separators, relative dates). */

export function money(minor: number | null | undefined, currency = 'GHS'): string {
  if (minor === null || minor === undefined) return '—'
  const symbol = currency === 'GHS' ? '₵' : `${currency} `
  const negative = minor < 0
  const abs = Math.abs(minor)
  const whole = Math.floor(abs / 100)
  const cents = String(abs % 100).padStart(2, '0')
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '−' : ''}${symbol}${grouped}.${cents}`
}

export function moneyFromCedis(amount: number): number {
  return Math.round(amount * 100)
}

export function moneyToInputValue(minor: number): string {
  return (minor / 100).toFixed(2)
}

export function dateLong(value: string | Date, timezone?: string): string {
  const d = typeof value === 'string' ? new Date(value) : value
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: timezone ?? undefined,
    }).format(d)
  } catch {
    return d.toDateString()
  }
}

export function dateShort(value: string | Date, timezone?: string): string {
  const d = typeof value === 'string' ? new Date(value) : value
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: timezone ?? undefined }).format(d)
  } catch {
    return d.toDateString()
  }
}

export function timeRange(start: string | Date, end: string | Date, timezone?: string): string {
  const fmt = (v: Date) => {
    try {
      return new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', timeZone: timezone ?? undefined }).format(v)
    } catch {
      return v.toTimeString().slice(0, 5)
    }
  }
  const s = typeof start === 'string' ? new Date(start) : start
  const e = typeof end === 'string' ? new Date(end) : end
  return `${fmt(s)} – ${fmt(e)}`
}

export function relative(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  const diffMs = d.getTime() - Date.now()
  const abs = Math.abs(diffMs)
  const minutes = Math.round(abs / 60000)
  const hours = Math.round(abs / 3600000)
  const days = Math.round(abs / 86400000)
  const future = diffMs > 0
  if (minutes < 1) return 'just now'
  if (minutes < 60) return future ? `in ${minutes} min` : `${minutes} min ago`
  if (hours < 24) return future ? `in ${hours} h` : `${hours} h ago`
  if (days < 30) return future ? `in ${days} days` : `${days} days ago`
  return dateShort(d)
}

export function countdown(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  const diff = d.getTime() - Date.now()
  if (diff <= 0) return 'happening now'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function statusTone(status: string): 'default' | 'success' | 'warning' | 'destructive' | 'info' {
  switch (status) {
    case 'PUBLISHED': case 'PAID': case 'SUCCESS': case 'ADMITTED': case 'VALID': case 'ACTIVE': case 'DONE': case 'DELIVERED': case 'RUNNING': case 'LIVE':
      return 'success'
    case 'PENDING_PAYMENT': case 'PENDING': case 'QUEUED': case 'ACCEPTED': case 'REQUESTED': case 'SCHEDULED': case 'APPROVED': case 'REDIRECTED': case 'INITIATED': case 'GRACE': case 'SUBMITTED':
      return 'warning'
    case 'CANCELLED': case 'FAILED': case 'REJECTED': case 'EXPIRED': case 'REFUNDED': case 'REVOKED': case 'DEAD': case 'SUSPENDED': case 'UNKNOWN':
      return 'destructive'
    case 'DRAFT': case 'ENDED': case 'CHECKED_IN': case 'EXCEPTION_REVIEW': case 'MANUAL_TRACKED': case 'SUPPRESSED':
      return 'default'
    default:
      return 'info'
  }
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}
