export function shopVerificationReturn(value: string | null): string | null {
  return value && /^\/shop\/[a-z0-9][a-z0-9-]{2,59}$/.test(value) ? value : null
}
export function shopVerificationHref(slug: string): string {
  const target = shopVerificationReturn('/shop/' + slug)
  return '#/verify-email' + (target ? '?returnTo=' + encodeURIComponent(target) : '')
}
export function isEmailVerificationRequired(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'EMAIL_VERIFICATION_REQUIRED' && 'status' in error && error.status === 403
}
