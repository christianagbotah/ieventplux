'use client'

import { useState } from 'react'
import { Mail, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '../api'
import { usePortal, type SessionUser } from '../store'

export default function VerifyEmail() {
  const { user, booted, setUser } = usePortal()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const refresh = async () => {
    const response = await api.get<{user: SessionUser | null}>('/auth/me')
    setUser(response.user)
  }
  const submit = async (resend: boolean) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (resend) {
        const result = await api.post<{alreadyVerified?: boolean}>('/auth/resend-code', {})
        if (result.alreadyVerified) await refresh()
        else { setCode(''); setNotice('A new code has been requested. Check your inbox and spam folder shortly.') }
      } else {
        await api.post('/auth/verify-contact', {channel: 'EMAIL', code})
        await refresh()
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.') }
    finally { setBusy(false) }
  }
  return <section className="mx-auto max-w-md px-4 py-10">
    <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      {user?.emailVerifiedAt ? <ShieldCheck className="size-9 text-emerald-600" aria-hidden /> : <Mail className="size-9 text-primary" aria-hidden />}
      <h1 className="text-2xl font-bold">{user?.emailVerifiedAt ? 'Email verified' : 'Verify your email'}</h1>
      {!booted ? <p role="status">Checking your account…</p> : !user ? <>
        <p className="text-sm text-muted-foreground">Sign in to verify the email address associated with your account.</p>
        <Button asChild><a href="#/signin?continue=%2Fverify-email">Sign in to verify</a></Button>
      </> : user.emailVerifiedAt ? <>
        <p className="break-all text-sm text-muted-foreground">{user.email} is verified.</p>
        <Button asChild><a href="#/me?tab=profile">Back to my account</a></Button>
      </> : <>
        <p className="text-sm text-muted-foreground">Enter the six-digit code sent to <strong className="break-all text-foreground">{user.email}</strong>. If you do not have a code, request a new one below.</p>
        <form className="space-y-4" onSubmit={e => {e.preventDefault(); void submit(false)}}>
          <label htmlFor="email-verification-code" className="block text-sm font-medium">Verification code</label>
          <Input id="email-verification-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
          <Button disabled={busy || code.length !== 6} type="submit" className="w-full">{busy ? 'Please wait…' : 'Verify email'}</Button>
        </form>
        <Button disabled={busy} variant="outline" onClick={() => void submit(true)}>Send a new code</Button>
        <p className="text-xs text-muted-foreground">Codes expire after 30 minutes.</p>
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <a className="block text-sm text-primary underline underline-offset-4" href="#/me?tab=profile">Back to my account</a>
      </>}
    </div>
  </section>
}
