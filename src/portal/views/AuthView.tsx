'use client'

import { useState } from 'react'
import { Church, Ticket, ShieldCheck, Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { usePortal, isPlatformStaff } from '../store'
import { humanize } from '../format'

export default function AuthView({ mode }: { mode: 'signin' | 'register' }) {
  const { toast } = useToast()
  const { setUser, setMemberships } = usePortal()
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetCodeSent, setResetCodeSent] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [form, setForm] = useState({ email: '', password: '', displayName: '', phone: '', marketingSms: false })

  // R21: one-click demo personas — every seeded account shares the dev-only seed
  // password (prisma/seed.ts DEV_PASSWORD); chips fill the form AND submit, so a
  // single tap signs straight into that persona's post-login destination (staff
  // roles land in the admin console via finishAuth, everyone else on Discover).
  const DEV_DEMO_PASSWORD = 'Dev@12345'
  const DEMO_ACCOUNTS = [
    { email: 'admin@ieventplux.dev', label: 'Super Admin' },
    { email: 'finance@ieventplux.dev', label: 'Finance Admin' },
    { email: 'moderator@ieventplux.dev', label: 'Moderator' },
    { email: 'support@ieventplux.dev', label: 'Support' },
    { email: 'pastor@lightworld.dev', label: 'Organizer' },
    { email: 'ama@example.dev', label: 'Attendee' },
  ]

  const doSignIn = async (email: string, password: string) => {
    await api.post('/auth/login', { email, password })
    await finishAuth()
  }

  const quickSignIn = async (account: { email: string; label: string }) => {
    if (busy) return
    setBusy(true)
    setForm((f) => ({ ...f, email: account.email, password: DEV_DEMO_PASSWORD }))
    try {
      await doSignIn(account.email, DEV_DEMO_PASSWORD)
    } catch (err) {
      toast({ title: 'Demo sign-in failed', description: err instanceof ApiClientError ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const finishAuth = async () => {
    const me = await api.get<{ user: Parameters<typeof setUser>[0]; memberships: Parameters<typeof setMemberships>[0] }>('/auth/me')
    if (!me.user) return
    setUser(me.user)
    setMemberships(me.memberships ?? [])
    // R20: platform staff (SUPPORT / MODERATOR / FINANCE_ADMIN / SUPER_ADMIN) sign in through
    // this same form — the session backend hands back their staff role, so we route them
    // straight into the admin console instead of the consumer landing page.
    if (isPlatformStaff(me.user)) {
      toast({
        title: `Welcome back, ${me.user.displayName.split(' ')[0]}`,
        description: `${humanize(me.user.role)} signed in — opening the platform admin console.`,
      })
      navigate('/admin')
      return
    }
    toast({ title: mode === 'signin' ? 'Welcome back' : `Welcome to iEventPlux, ${me.user.displayName.split(' ')[0]}!` })
    navigate('/')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'signin') {
        await doSignIn(form.email, form.password)
      } else {
        const result = await api.post<{ devVerificationCode: string | null }>('/auth/register', {
          email: form.email,
          password: form.password,
          displayName: form.displayName,
          phone: form.phone || undefined,
          marketingSms: form.marketingSms,
        })
        if (result.devVerificationCode) {
          toast({
            title: 'Account created',
            description: `DEV: your email verification code is ${result.devVerificationCode} (SMTP is not configured — see Profile to verify).`,
          })
        }
        await finishAuth()
      }
    } catch (err) {
      toast({ title: 'Authentication failed', description: err instanceof ApiClientError ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const requestReset = async () => {
    if (resetBusy) return
    setResetBusy(true)
    try {
      const res = await api.post<{ devResetCode: string | null }>('/auth/password-reset', { email: resetEmail })
      setResetCodeSent(res.devResetCode ?? 'sent')
      toast({ description: res.devResetCode ? `DEV: reset code is ${res.devResetCode}` : 'If that account exists, a reset code has been sent.' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not start reset.', variant: 'destructive' })
    } finally {
      setResetBusy(false)
    }
  }

  const confirmReset = async () => {
    if (resetBusy) return
    setResetBusy(true)
    try {
      await api.post('/auth/password-reset-confirm', { email: resetEmail, code: resetCode, password: newPassword })
      toast({ title: 'Password updated', description: 'Sign in with your new password.' })
      setResetOpen(false)
      navigate('/signin')
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not reset password.', variant: 'destructive' })
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:grid-cols-2 md:items-center">
      {/* Aurora welcome banner */}
      <div className="efx-aurora-bg iefx-stage md:col-span-2" style={{ padding: 'clamp(1.5rem, 4vw, 2.5rem)' }}>
        <div className="efx-aurora-bg__content">
          <span className="efx-aurora-bg__kicker">Welcome to iEventPlux</span>
          <p className="efx-aurora-bg__title">{mode === 'signin' ? 'Good to see you again' : 'Your next gathering starts here'}</p>
          <p className="efx-aurora-bg__meta">Discover events, pay with mobile money and keep every QR ticket in your pocket.</p>
        </div>
      </div>

      <div className="hidden md:block">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Ticket className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold leading-tight">
          {mode === 'signin' ? 'Welcome back to ' : 'Join '}
          <span className="ievx-gradient-text">iEventPlux</span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          Discover gatherings, buy tickets with mobile money, watch protected live streams and keep your QR tickets at hand.
        </p>
        <ul className="mt-6 space-y-3 text-sm">
          {[
            { icon: Church, text: 'Follow your church or ministry and never miss a service' },
            { icon: Ticket, text: 'Secure checkout with instant QR tickets' },
            { icon: ShieldCheck, text: 'Verified organizers, protected broadcasts' },
          ].map((f, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary"><f.icon className="h-4 w-4 text-primary" aria-hidden /></span>
              {f.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="ievx-surface p-6 sm:p-8">
        <h2 className="text-xl font-bold">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'signin' ? 'Use your email and password.' : 'It takes less than a minute.'}
        </p>
        <form onSubmit={submit} className="mt-6">
          {mode === 'register' && (
            <div className="efx-floating-label-input" style={{ maxWidth: '100%', margin: '0 0 0.9rem' }}>
              <input
                id="displayName"
                name="displayName"
                className="efx-floating-label-input__field"
                placeholder=" "
                required
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                autoComplete="name"
              />
              <label htmlFor="displayName" className="efx-floating-label-input__label">Full name</label>
            </div>
          )}
          <div className="efx-floating-label-input" style={{ maxWidth: '100%', margin: '0 0 0.9rem' }}>
            <input
              id="email"
              name="email"
              type="email"
              className="efx-floating-label-input__field"
              placeholder=" "
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              autoComplete="email"
            />
            <label htmlFor="email" className="efx-floating-label-input__label">Email</label>
          </div>
          {mode === 'register' && (
            <div className="efx-floating-label-input" style={{ maxWidth: '100%', margin: '0 0 0.9rem' }}>
              <input
                id="phone"
                name="phone"
                className="efx-floating-label-input__field"
                placeholder=" "
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                inputMode="tel"
                autoComplete="tel"
              />
              <label htmlFor="phone" className="efx-floating-label-input__label">Phone (optional — for ticket SMS)</label>
            </div>
          )}
          <div className="efx-floating-label-input relative" style={{ maxWidth: '100%', margin: '0 0 0.35rem' }}>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              className="efx-floating-label-input__field"
              style={{ paddingRight: '3.5rem' }}
              placeholder=" "
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
            <label htmlFor="password" className="efx-floating-label-input__label">Password</label>
            <button
              type="button"
              className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4.5 w-4.5" aria-hidden /> : <Eye className="h-4.5 w-4.5" aria-hidden />}
            </button>
          </div>
          {mode === 'signin' && (
            <div className="mb-3 flex justify-end">
              <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setResetOpen(true)}>Forgot password?</button>
            </div>
          )}
          {mode === 'register' && (
            <label className="mb-4 flex items-start gap-2.5 text-sm text-muted-foreground">
              <Checkbox checked={form.marketingSms} onCheckedChange={(v) => setForm((f) => ({ ...f, marketingSms: v === true }))} />
              <span>Send me event updates and offers by SMS (transactional messages like tickets are always sent; you can unsubscribe anytime).</span>
            </label>
          )}
          <button
            type="submit"
            className="efx-neon-pulse-button"
            style={{ width: '100%', ...(busy ? { opacity: 0.6, cursor: 'not-allowed', animation: 'none' } : {}) }}
            disabled={busy}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === 'signin' ? (
            <>New to iEventPlux? <button type="button" className="efx-underline-slide-link" style={{ fontSize: 'inherit', color: 'inherit', fontWeight: 600, paddingBottom: '2px' }} onClick={() => navigate('/register')}>Create an account</button></>
          ) : (
            <>Already have an account? <button type="button" className="efx-underline-slide-link" style={{ fontSize: 'inherit', color: 'inherit', fontWeight: 600, paddingBottom: '2px' }} onClick={() => navigate('/signin')}>Sign in</button></>
          )}
        </p>
        {mode === 'signin' && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
            Platform staff: sign in with your staff email — you will land straight in the admin console.
          </p>
        )}
        {process.env.NODE_ENV !== 'production' && mode === 'signin' && (
          <div className="mt-5 rounded-xl border border-border/70 bg-secondary/40 p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Demo accounts — one-click sign-in (dev seed)</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => void quickSignIn(a)}
                  disabled={busy}
                  aria-label={`Sign in as demo ${a.label}`}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary disabled:opacity-50 ievx-press"
                >
                  {busy && form.email === a.email ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                  {a.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] text-muted-foreground/80">All demo personas share the seed password Dev@12345 — review without hunting for credentials.</p>
          </div>
        )}
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              We will send a reset code to your email. All existing sessions are revoked after a successful reset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="email" autoComplete="email" placeholder="you@example.com" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} aria-label="Password reset email" />
            <Button className="w-full rounded-xl" disabled={resetBusy || !resetEmail.trim()} onClick={() => void requestReset()}>
              {resetBusy ? 'Sending…' : 'Send reset code'}
            </Button>
            {resetCodeSent && (
              <>
                <Input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={resetCode} onChange={(e) => setResetCode(e.target.value)} aria-label="Reset code" />
                <div className="relative">
                  <Input type={showResetPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} className="pr-12" placeholder="New password (min 8 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} aria-label="New password" />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
                    onClick={() => setShowResetPassword((value) => !value)}
                    aria-label={showResetPassword ? 'Hide new password' : 'Show new password'}
                    aria-pressed={showResetPassword}
                  >
                    {showResetPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
                <Button className="w-full rounded-xl" disabled={resetBusy || resetCode.trim().length < 4 || newPassword.length < 8} onClick={() => void confirmReset()}>
                  {resetBusy ? 'Updating…' : 'Set new password'}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
