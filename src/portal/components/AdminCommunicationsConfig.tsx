'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, CheckCircle2, Loader2, Mail, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'

type SmsView = { provider: 'HUBTEL'; configured: boolean; senderIdMasked: string; clientIdMasked: string; secretSaved: boolean; source: string }
type SmtpView = { configured: boolean; source: string; host: string; port: number; usernameMasked: string; passwordSaved: boolean; from: string; note: string }

/** Superadmin-only forms. Never prefill the secret in browser inputs, even in a
 * password field; blank secrets retain the server's existing encrypted value. */
export function AdminCommunicationsConfig({ onSaved }: { onSaved?: () => void }) {
  const { toast } = useToast()
  const [sms, setSms] = useState<SmsView | null>(null)
  const [mail, setMail] = useState<SmtpView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'sms' | 'smtp' | null>(null)
  const [testBusy, setTestBusy] = useState<'smtpVerify' | 'smtpEmail' | 'smsTest' | null>(null)
  const [smsRecipient, setSmsRecipient] = useState('')
  const [smsTestConsent, setSmsTestConsent] = useState(false)
  const [emailRecipient, setEmailRecipient] = useState('')
  const [emailTestConsent, setEmailTestConsent] = useState(false)
  const [testResult, setTestResult] = useState<{ kind: string; ok: boolean; detail: string } | null>(null)
  const [error, setError] = useState('')
  const [smsFields, setSmsFields] = useState({ clientId: '', clientSecret: '', senderId: '' })
  const [smtpFields, setSmtpFields] = useState({ host: '', port: '587', username: '', password: '', from: '' })

  const load = useCallback(async () => {
    setError('')
    try {
      const [smsResult, smtpResult] = await Promise.all([
        api.get<{ sms: SmsView }>('/admin/sms-configuration'),
        api.get<{ smtp: SmtpView }>('/admin/smtp'),
      ])
      setSms(smsResult.sms)
      setMail(smtpResult.smtp)
      setSmtpFields((previous) => ({ ...previous,
        host: smtpResult.smtp.host || '', port: String(smtpResult.smtp.port || 587),
        from: smtpResult.smtp.from === 'no-reply@ieventplux.local' ? '' : smtpResult.smtp.from,
      }))
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not read SMS and email settings.')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const saveSms = async () => {
    if (!smsFields.clientId && !smsFields.clientSecret && !smsFields.senderId) return
    setBusy('sms')
    try {
      const result = await api.post<{ note: string }>('/admin/sms-configuration', smsFields)
      setSmsFields({ clientId: '', clientSecret: '', senderId: '' })
      toast({ title: 'SMS configuration saved', description: result.note })
      await load()
      onSaved?.()
    } catch (err) {
      toast({ title: 'Could not save SMS', description: err instanceof ApiClientError ? err.message : 'Please retry.', variant: 'destructive' })
    } finally { setBusy(null) }
  }
  const saveSmtp = async () => {
    if (!mail?.configured && (!smtpFields.host || !smtpFields.username || !smtpFields.password || !smtpFields.from)) {
      toast({ title: 'Complete the email settings', description: 'Enter the SMTP hostname, account username, app password and sender email before saving a new provider.', variant: 'destructive' })
      return
    }
    setBusy('smtp')
    try {
      const result = await api.post<{ smtp: SmtpView; note: string }>('/admin/smtp', smtpFields)
      setMail(result.smtp)
      setSmtpFields((previous) => ({ ...previous, password: '' }))
      onSaved?.()
      toast({ title: 'Email settings saved', description: result.note })
    } catch (err) {
      toast({ title: 'Could not save email settings', description: err instanceof ApiClientError ? err.message : 'Please retry.', variant: 'destructive' })
    } finally { setBusy(null) }
  }

  const testProvider = async (kind: 'smtpVerify' | 'smtpEmail' | 'smsTest') => {
    setTestBusy(kind)
    setTestResult(null)
    try {
      const path = kind === 'smsTest' ? '/admin/sms-configuration/test-message' : kind === 'smtpEmail' ? '/admin/smtp/test-message' : '/admin/smtp/verify'
      const body = kind === 'smsTest' ? { phone: smsRecipient, confirmCharge: smsTestConsent, confirmRecipient: smsTestConsent }
        : kind === 'smtpEmail' ? { recipient: emailRecipient, confirmRecipient: emailTestConsent } : {}
      const result = await api.post<{ ok?: boolean; queued?: boolean; detail: string }>(path, body)
      const ok = result.ok ?? result.queued ?? false
      setTestResult({ kind, ok, detail: result.detail })
      if (ok) toast({ title: kind === 'smtpVerify' ? 'SMTP authentication verified' : 'Test message queued', description: result.detail })
      else toast({ title: 'Test did not pass', description: result.detail, variant: 'destructive' })
      if (kind === 'smsTest') setSmsTestConsent(false)
      if (kind === 'smtpEmail') setEmailTestConsent(false)
    } catch (err) {
      const detail = err instanceof ApiClientError ? err.message : 'Provider test failed. Please check settings and retry.'
      setTestResult({ kind, ok: false, detail })
      toast({ title: 'Provider test failed', description: detail, variant: 'destructive' })
    } finally { setTestBusy(null) }
  }

  if (loading) return <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading communication providers…</div>
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-base font-bold">Email & SMS delivery settings</h2><p className="mt-1 text-xs text-muted-foreground">Configured by the platform super administrator. Credentials remain server-side; saved passwords are never shown again.</p></div>
        <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-1 size-3.5" /> Refresh</Button>
      </div>
      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{error}</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0 rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2"><Bell className="size-4 text-primary" /> Hubtel SMS</span><Badge variant={sms?.configured ? 'default' : 'outline'}>{sms?.configured ? 'Credentials present' : 'Not configured'}</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs leading-relaxed text-muted-foreground">Configure SMS independently of checkout and payouts. You need an SMS-enabled Hubtel API account and an approved sender ID. Saved settings do not prove handset delivery.</p>
            {sms && <p className="rounded-lg bg-secondary/50 p-2 text-[11px] text-muted-foreground">Source: {sms.source} · Client: {sms.clientIdMasked || 'Missing'} · Sender: {sms.senderIdMasked || 'Missing'}</p>}
            <div className="space-y-1.5"><Label htmlFor="sms-client-id">Hubtel SMS Client ID</Label><Input id="sms-client-id" autoComplete="off" value={smsFields.clientId} onChange={(e) => setSmsFields((f) => ({ ...f, clientId: e.target.value }))} placeholder={sms?.clientIdMasked ? `Saved: ${sms.clientIdMasked} — blank keeps it` : 'Paste SMS client ID'} /></div>
            <div className="space-y-1.5"><Label htmlFor="sms-secret">Hubtel SMS Client Secret</Label><Input id="sms-secret" type="password" autoComplete="new-password" value={smsFields.clientSecret} onChange={(e) => setSmsFields((f) => ({ ...f, clientSecret: e.target.value }))} placeholder={sms?.secretSaved ? 'Saved securely — leave blank to keep' : 'Paste client secret'} /></div>
            <div className="space-y-1.5"><Label htmlFor="sms-sender">Approved Sender ID</Label><Input id="sms-sender" autoComplete="off" maxLength={20} value={smsFields.senderId} onChange={(e) => setSmsFields((f) => ({ ...f, senderId: e.target.value }))} placeholder={sms?.senderIdMasked ? `Saved: ${sms.senderIdMasked}` : 'e.g. IEVENTPLUX'} /></div>
            <Button className="min-h-10 w-full sm:w-auto" disabled={busy !== null || (!smsFields.clientId && !smsFields.clientSecret && !smsFields.senderId)} onClick={() => void saveSms()}>{busy === 'sms' ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <ShieldCheck className="mr-1.5 size-4" />} Save SMS settings</Button>
            <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3">
              <p className="text-xs font-bold">Test real SMS delivery</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">One test SMS will be sent through Hubtel to a number you control. Charges may apply. It is queued first; the Message Log records the actual provider response.</p>
              <Label htmlFor="sms-test-number">Your test phone (international format)</Label>
              <Input id="sms-test-number" type="tel" inputMode="tel" autoComplete="tel" value={smsRecipient} onChange={(e) => setSmsRecipient(e.target.value)} placeholder="+233XXXXXXXXX" />
              <label className="flex items-start gap-2 text-xs leading-relaxed"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={smsTestConsent} onChange={(e) => setSmsTestConsent(e.target.checked)} /> I control this phone and approve one potentially chargeable SMS test.</label>
              <Button type="button" size="sm" variant="outline" className="min-h-10 w-full sm:w-auto" disabled={!sms?.configured || !smsTestConsent || !smsRecipient.trim() || busy !== null || testBusy !== null} onClick={() => void testProvider('smsTest')}>{testBusy === 'smsTest' ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Bell className="mr-1.5 size-4" />} Queue one test SMS</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">The Message Log separates queued, accepted, delivered, failed and suppressed statuses. A successful API acceptance is not proof of handset delivery.</p>
          </CardContent>
        </Card>
        <Card className="min-w-0 rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2"><Mail className="size-4 text-primary" /> SMTP email</span><Badge variant={mail?.configured ? 'default' : 'outline'}>{mail?.configured ? 'Credentials present' : 'Not configured'}</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs leading-relaxed text-muted-foreground">Use your email provider’s SMTP details, including an app password where required. Changes are read by the delivery worker without a website redeploy.</p>
            {mail && <p className="rounded-lg bg-secondary/50 p-2 text-[11px] text-muted-foreground">Source: {mail.source} · User: {mail.usernameMasked || 'Missing'} · Password: {mail.passwordSaved ? 'saved' : 'missing'} · Delivery: not yet tested</p>}
            <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-3">
              <div className="space-y-1.5"><Label htmlFor="smtp-host">SMTP hostname</Label><Input id="smtp-host" autoComplete="off" value={smtpFields.host} onChange={(e) => setSmtpFields((f) => ({ ...f, host: e.target.value }))} placeholder="smtp.example.com" /></div>
              <div className="space-y-1.5"><Label htmlFor="smtp-port">Port</Label><Input id="smtp-port" inputMode="numeric" value={smtpFields.port} onChange={(e) => setSmtpFields((f) => ({ ...f, port: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="smtp-user">SMTP username</Label><Input id="smtp-user" autoComplete="off" value={smtpFields.username} onChange={(e) => setSmtpFields((f) => ({ ...f, username: e.target.value }))} placeholder={mail?.usernameMasked ? `Saved: ${mail.usernameMasked} — blank keeps it` : 'Email account or SMTP user'} /></div>
            <div className="space-y-1.5"><Label htmlFor="smtp-pass">SMTP app password</Label><Input id="smtp-pass" type="password" autoComplete="new-password" value={smtpFields.password} onChange={(e) => setSmtpFields((f) => ({ ...f, password: e.target.value }))} placeholder={mail?.passwordSaved ? 'Saved encrypted — blank keeps it' : 'App-specific password or provider secret'} /></div>
            <div className="space-y-1.5"><Label htmlFor="smtp-from">Sender email (From)</Label><Input id="smtp-from" type="email" autoComplete="off" value={smtpFields.from} onChange={(e) => setSmtpFields((f) => ({ ...f, from: e.target.value }))} placeholder="ieventplux@lightworldtech.com" /></div>
            <Button className="min-h-10 w-full sm:w-auto" disabled={busy !== null} onClick={() => void saveSmtp()}>{busy === 'smtp' ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 size-4" />} Save SMTP settings</Button>
            <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-3">
              <p className="text-xs font-bold">Verify SMTP and send a test email</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">Verify checks whether the server can connect and authenticate; no message is sent. The separate test email goes through the normal delivery worker.</p>
              <Button type="button" variant="outline" size="sm" className="min-h-10 w-full sm:w-auto" disabled={!mail?.configured || busy !== null || testBusy !== null} onClick={() => void testProvider('smtpVerify')}>{testBusy === 'smtpVerify' ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 size-4" />} Verify SMTP connection</Button>
              <div className="space-y-1.5"><Label htmlFor="smtp-test-recipient">Test recipient mailbox</Label><Input id="smtp-test-recipient" type="email" autoComplete="email" value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)} placeholder="your-address@example.com" /></div>
              <label className="flex items-start gap-2 text-xs leading-relaxed"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={emailTestConsent} onChange={(e) => setEmailTestConsent(e.target.checked)} /> I control this email inbox and want one test email sent.</label>
              <Button type="button" variant="outline" size="sm" className="min-h-10 w-full sm:w-auto" disabled={!mail?.configured || !emailRecipient.trim() || !emailTestConsent || busy !== null || testBusy !== null} onClick={() => void testProvider('smtpEmail')}>{testBusy === 'smtpEmail' ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Mail className="mr-1.5 size-4" />} Queue one test email</Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">Supported ports: 465 (TLS) or 587/2525 (STARTTLS). Saved or authenticated settings do not guarantee inbox arrival. SMTP-accepted emails are marked Sent, not Delivered.</p>
          </CardContent>
        </Card>
      </div>
      {testResult && <div role="status" className={`rounded-xl border p-3 text-xs leading-relaxed ${testResult.ok ? 'border-primary/25 bg-primary/5' : 'border-amber-500/30 bg-amber-500/10'}`}><p className="font-bold">{testResult.kind === 'smsTest' ? 'SMS test' : testResult.kind === 'smtpEmail' ? 'Email test' : 'SMTP connection'}: {testResult.ok ? 'Submitted successfully' : 'Not successful'}</p><p className="mt-1">{testResult.detail}</p></div>}
    </div>
  )
}
