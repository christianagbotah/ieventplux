'use client'

import { useState } from 'react'
import { Church, Ticket, ShieldCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { navigate } from '../router'
import { usePortal } from '../store'

export default function AuthView({ mode }: { mode: 'signin' | 'register' }) {
  const { toast } = useToast()
  const { setUser, setMemberships } = usePortal()
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetCodeSent, setResetCodeSent] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [form, setForm] = useState({ email: '', password: '', displayName: '', phone: '', marketingSms: false })

  const finishAuth = async () => {
    const me = await api.get<{ user: Parameters<typeof setUser>[0]; memberships: Parameters<typeof setMemberships>[0] }>('/auth/me')
    if (!me.user) return
    setUser(me.user)
    setMemberships(me.memberships ?? [])
    toast({ title: mode === 'signin' ? 'Welcome back 👋' : `Welcome to iEventPlux, ${me.user.displayName.split(' ')[0]}!` })
    navigate('/')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'signin') {
        await api.post('/auth/login', { email: form.email, password: form.password })
        await finishAuth()
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
    try {
      const res = await api.post<{ devResetCode: string | null }>('/auth/password-reset', { email: resetEmail })
      setResetCodeSent(res.devResetCode ?? 'sent')
      toast({ description: res.devResetCode ? `DEV: reset code is ${res.devResetCode}` : 'If that account exists, a reset code has been sent.' })
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not start reset.', variant: 'destructive' })
    }
  }

  const confirmReset = async () => {
    try {
      await api.post('/auth/password-reset-confirm', { email: resetEmail, code: resetCode, password: newPassword })
      toast({ title: 'Password updated', description: 'Sign in with your new password.' })
      setResetOpen(false)
      navigate('/signin')
    } catch (err) {
      toast({ description: err instanceof ApiClientError ? err.message : 'Could not reset password.', variant: 'destructive' })
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:grid-cols-2 md:items-center">
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

      <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-bold">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'signin' ? 'Use your email and password.' : 'It takes less than a minute.'}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === 'register' && (
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Full name</Label>
              <Input id="displayName" required value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} placeholder="Ama Darko" autoComplete="name" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@example.com" autoComplete="email" />
          </div>
          {mode === 'register' && (
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone (optional — for ticket SMS)</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+233 24 000 0000" inputMode="tel" autoComplete="tel" />
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {mode === 'signin' && (
                <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setResetOpen(true)}>Forgot password?</button>
              )}
            </div>
            <Input id="password" type="password" required minLength={8} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="••••••••" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          </div>
          {mode === 'register' && (
            <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Checkbox checked={form.marketingSms} onCheckedChange={(v) => setForm((f) => ({ ...f, marketingSms: v === true }))} />
              <span>Send me event updates and offers by SMS (transactional messages like tickets are always sent; you can unsubscribe anytime).</span>
            </label>
          )}
          <Button type="submit" className="w-full rounded-xl py-5 ievx-press" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === 'signin' ? (
            <>New to iEventPlux? <button className="font-semibold text-primary hover:underline" onClick={() => navigate('/register')}>Create an account</button></>
          ) : (
            <>Already have an account? <button className="font-semibold text-primary hover:underline" onClick={() => navigate('/signin')}>Sign in</button></>
          )}
        </p>
      </div>

      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-label="Password reset">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl ievx-scale">
            <h3 className="text-lg font-bold">Reset your password</h3>
            <p className="mt-1 text-sm text-muted-foreground">We will send a reset code to your email. All sessions are revoked after a reset.</p>
            <div className="mt-4 space-y-3">
              <Input placeholder="your@email.com" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} aria-label="Email" />
              <Button className="w-full rounded-xl" onClick={() => void requestReset()}>Send reset code</Button>
              {resetCodeSent && (
                <>
                  <Input placeholder="6-digit code" value={resetCode} onChange={(e) => setResetCode(e.target.value)} aria-label="Reset code" />
                  <Input type="password" placeholder="New password (min 8 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} aria-label="New password" />
                  <Button className="w-full rounded-xl" onClick={() => void confirmReset()}>Set new password</Button>
                </>
              )}
              <Button variant="ghost" className="w-full" onClick={() => setResetOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
