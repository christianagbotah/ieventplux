'use client'

import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock, Pencil, Plus, RefreshCw, ShieldCheck, Smartphone, Ticket, Users, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { api, ApiClientError } from '../api'
import { relative } from '../format'
import { admissionProgress, deviceSyncLabel, type AdmissionOperations } from '../lib/admission-operations'

/** Read-only near-live dashboard. Automatically pauses on hidden tabs.
 * This is 15-second polling, not a claimed WebSocket or true presence feed.
 */
type ManagedDevice = AdmissionOperations['devices'][number]
type DeviceAction = { type: 'REGISTER' | 'RENAME' | 'REVOKE'; device?: ManagedDevice }

export function AdmissionOperationsPanel({
  eventId, refreshKey, browserSessionId, onSessionRegistered,
}: {
  eventId: string
  refreshKey: number
  browserSessionId: string
  onSessionRegistered: (id: string) => void
}) {
  const { toast } = useToast()
  const [dialog, setDialog] = useState<DeviceAction | null>(null)
  const [draftName, setDraftName] = useState('Browser scanner')
  const [actionError, setActionError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [data, setData] = useState<AdmissionOperations | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [revision, setRevision] = useState(0)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)

  useEffect(() => {
    const controller = new AbortController()
    let inFlight = false
    const load = async () => {
      if (controller.signal.aborted || document.hidden || !navigator.onLine || inFlight) return
      inFlight = true
      try {
        const snapshot = await api.get<AdmissionOperations>(
          '/checkin/monitor?eventId=' + encodeURIComponent(eventId),
          { signal: controller.signal },
        )
        if (!controller.signal.aborted) {
          setData(snapshot)
          setError('')
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof ApiClientError ? cause.message : 'Live admission information could not be refreshed.')
        }
      } finally {
        inFlight = false
        if (!controller.signal.aborted) setBusy(false)
      }
    }
    const onVisibility = () => { if (!document.hidden) void load() }
    const onNetwork = () => {
      setOnline(navigator.onLine)
      if (navigator.onLine) void load()
    }
    void load()
    const timer = window.setInterval(() => void load(), 15_000)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onNetwork)
    window.addEventListener('offline', onNetwork)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onNetwork)
      window.removeEventListener('offline', onNetwork)
    }
  }, [eventId, refreshKey, revision])

  const browserSession = data?.devices.find((row) => row.id === browserSessionId)
  const browserRevoked = Boolean(browserSession?.revoked)

  const openAction = (type: DeviceAction['type'], device?: ManagedDevice) => {
    setActionError('')
    setDraftName(type === 'REGISTER' ? 'Browser scanner' : device?.name ?? '')
    setDialog({ type, device })
  }

  const submitDeviceAction = async () => {
    if (!dialog || actionBusy) return
    setActionBusy(true)
    setActionError('')
    try {
      if (dialog.type === 'REGISTER') {
        const result = await api.post<{ deviceSessionId: string }>('/checkin/device-sessions', {
          eventId, name: draftName.trim(),
        })
        onSessionRegistered(result.deviceSessionId)
        toast({ title: 'Browser scanner registered', description: 'New scans and syncs will carry this session reference.' })
      } else {
        const target = dialog.device
        if (!target) throw new Error('No scanner was selected.')
        await api.patch('/checkin/device-sessions', {
          eventId, deviceSessionId: target.id,
          operation: dialog.type, ...(dialog.type === 'RENAME' ? { name: draftName.trim() } : {}),
        })
        toast({
          title: dialog.type === 'RENAME' ? 'Scanner renamed' : 'Scanner session revoked',
          description: dialog.type === 'REVOKE'
            ? 'This session ID can no longer be used for new scans. Staff account permissions are unchanged.'
            : 'The scanner label has been updated.',
        })
      }
      setDialog(null)
      setRevision((current) => current + 1)
    } catch (error) {
      setActionError(error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : 'Scanner action failed.')
    } finally {
      setActionBusy(false)
    }
  }

  const progress = data ? admissionProgress(data.totals.ticketsIssued, data.totals.admitted) : 0
  const cells = [
    { title: 'Tickets issued', value: data?.totals.ticketsIssued, icon: Ticket, explanation: 'Includes inactive tickets' },
    { title: 'Admitted', value: data?.totals.admitted, icon: CheckCircle2, explanation: progress + '% of issued tickets' },
    { title: 'Valid to admit', value: data?.totals.validToAdmit, icon: Users, explanation: 'Excludes refunded or revoked' },
    { title: 'Issues recorded', value: data?.totals.anomalies, icon: AlertTriangle, explanation: 'All-time logged issues' },
  ]

  return (
    <section className="ievx-admission-ops space-y-3 rounded-2xl border border-border bg-card p-3.5 sm:p-5" aria-label="Admission operations monitor">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-base font-extrabold tracking-tight sm:text-lg">
            <Activity className="size-5 text-primary" aria-hidden /> Admission operations
            <Badge variant="outline" className="text-[10px]">15s refresh</Badge>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Verified server counts and scanner activity for this event. No attendee details in this feed.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" className={'text-[11px] ' + (error || !online ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
            {!online ? 'Offline — updates paused' : error ? 'Refresh failed — showing last snapshot' :
              data ? 'Updated ' + relative(data.asOf) : busy ? 'Loading…' : 'No snapshot yet'}
          </span>
          <Button variant="outline" size="sm" className="min-h-10 rounded-xl" disabled={!online || busy}
            aria-label="Refresh admission operations" onClick={() => setRevision((value) => value + 1)}>
            <RefreshCw className={'size-4 ' + (busy && !data ? 'animate-spin' : '')} aria-hidden /> Refresh
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs">
          {error} Counts below may be outdated until the connection recovers.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.title} className="min-w-0 rounded-xl border border-border/75 bg-muted/35 p-3">
            <p className="flex items-start justify-between gap-2 text-[11px] font-semibold text-muted-foreground">
              <span>{cell.title}</span><cell.icon className="size-4 shrink-0 text-primary" aria-hidden />
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums sm:text-3xl">
              {cell.value === undefined ? (busy ? '…' : '—') : cell.value.toLocaleString()}
            </p>
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{cell.explanation}</p>
          </div>
        ))}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Admitted proportion of tickets issued"
        aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: progress + '%' }} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Last 15 minutes</span>
        <span><strong className="text-foreground">{data?.recent15Min.admitted ?? '—'}</strong> admitted</span>
        <span><strong className="text-foreground">{data?.recent15Min.duplicate ?? '—'}</strong> duplicates</span>
        <span><strong className="text-foreground">{data?.recent15Min.conflict ?? '—'}</strong> conflicts</span>
        <span><strong className="text-foreground">{data?.recent15Min.invalid ?? '—'}</strong> invalid</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-border/70 p-3.5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600" aria-hidden />
            <h3 className="text-sm font-bold">Recent admission issues</h3>
            <span className="ml-auto text-[10px] text-muted-foreground">Latest 8 logged</span>
          </div>
          {!data ? <p className="text-xs text-muted-foreground">Loading issue activity…</p> :
            data.alerts.length === 0 ? <p className="text-xs text-muted-foreground">No duplicate, conflict or invalid attempts logged for this event.</p> :
              <ul className="max-h-56 space-y-2 overflow-y-auto" aria-label="Recent admission issues">
                {data.alerts.map((alert) => (
                  <li key={alert.id} className="flex min-w-0 items-start gap-2 rounded-lg bg-muted/45 p-2.5">
                    <span className={'mt-0.5 size-2 shrink-0 rounded-full ' + (alert.result === 'CONFLICT' ? 'bg-rose-500' : 'bg-amber-500')} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{alert.result === 'DUPLICATE' ? 'Duplicate scan' : alert.result === 'CONFLICT' ? 'Offline conflict' : 'Invalid attempt'}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{alert.staffName} · {alert.source === 'OFFLINE_SYNC' ? 'Offline sync' : 'Online scan'}</p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{relative(alert.scannedAt)}</span>
                  </li>
                ))}
              </ul>}
          <p className="mt-2 text-[10px] text-muted-foreground">Only attempts recorded by the server appear here. Invalid unrecognized QR codes may not be logged.</p>
        </div>
        <div className="min-w-0 rounded-xl border border-border/70 p-3.5">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            <h3 className="text-sm font-bold">Staff scanner activity</h3>
            <span className="ml-auto text-[10px] text-muted-foreground">Last 15 min</span>
          </div>
          {!data ? <p className="text-xs text-muted-foreground">Loading scanner activity…</p> :
            data.scanners.length === 0 ? <p className="text-xs text-muted-foreground">No server-recorded scanning activity in the last 15 minutes.</p> :
              <ul className="max-h-56 space-y-2 overflow-y-auto" aria-label="Staff scanner activity">
                {data.scanners.map((scanner) => (
                  <li key={scanner.userId} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-muted/45 p-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">{scanner.name}</span>
                      <span className="block text-[10px] text-muted-foreground">Last recorded {relative(scanner.lastScanAt)}</span>
                    </span>
                    <span className="shrink-0 rounded-lg bg-background px-2 py-1 text-xs font-bold tabular-nums">
                      {scanner.attempts15Min} scans
                    </span>
                  </li>
                ))}
              </ul>}
        </div>
      </div>

      <details className="group rounded-xl border border-border/70 p-3.5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <span className="flex items-center gap-2">
            <Smartphone className="size-4 text-primary" aria-hidden />
            Registered devices
            <Badge variant="outline">{data?.devices.length ?? '—'} shown</Badge>
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">Manage & view history</span>
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          A registered device or recent sync is not proof that it is currently connected. Only the last 12 registered sessions are shown.
          Revoking a device blocks that session ID, but does not remove the staff member's event permissions or block older clients that scan without a device session.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2.5">
          <p className="text-xs text-muted-foreground">
            {browserRevoked
              ? 'This browser session has been revoked. Register a replacement before scanning.'
              : browserSessionId ? 'This browser has a saved scanner reference for the selected event.' : 'This browser is not registered for this event.'}
          </p>
          <Button type="button" variant="outline" size="sm" className="min-h-10 rounded-xl"
            onClick={(event) => { event.preventDefault(); openAction('REGISTER') }}>
            <Plus className="size-4" aria-hidden />
            {browserSessionId ? 'Register replacement' : 'Register this browser'}
          </Button>
        </div>
        {data?.devices.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No device sessions have been registered for this event.</p> :
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {data?.devices.map((device) => (
              <li key={device.id} className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-semibold">{device.name}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {browserSessionId === device.id && <Badge variant="secondary" className="text-[10px]">This browser</Badge>}
                    {device.revoked && <Badge variant="outline" className="text-[10px]">Revoked</Badge>}
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{device.staffName}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="size-3" aria-hidden />{deviceSyncLabel(device.lastSyncAt)}
                  {device.lastSyncAt ? ' · ' + relative(device.lastSyncAt) : ''}
                </p>
                {device.canManage && !device.revoked && (
                  <div className="mt-2 flex flex-wrap gap-2 border-t border-border/60 pt-2">
                    <Button type="button" variant="outline" size="sm" className="min-h-9 rounded-lg"
                      aria-label={'Rename scanner ' + device.name}
                      onClick={() => openAction('RENAME', device)}>
                      <Pencil className="size-3.5" aria-hidden /> Rename
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="min-h-9 rounded-lg text-destructive"
                      aria-label={'Revoke scanner ' + device.name}
                      onClick={() => openAction('REVOKE', device)}>
                      <XCircle className="size-3.5" aria-hidden /> Revoke
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>}
      </details>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        This is a 15-second refresh snapshot, not a live video feed or a device-presence detector. Browser-offline scans remain pending until server verification.
      </p>
      <Dialog open={Boolean(dialog)} onOpenChange={(isOpen) => { if (!isOpen && !actionBusy) setDialog(null) }}>
        <DialogContent className="w-[min(94vw,440px)] rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {dialog?.type === 'REGISTER' ? 'Register browser scanner'
                : dialog?.type === 'RENAME' ? 'Rename scanner' : 'Revoke scanner session?'}
            </DialogTitle>
            <DialogDescription>
              {dialog?.type === 'REVOKE'
                ? 'This prevents further scans and syncs using this device session ID. Historical admissions remain in the audit log. Staff membership is not removed.'
                : 'Give the scanner a recognizable label, such as Gate A or Main Hall. This makes device and staff activity easier to audit.'}
            </DialogDescription>
          </DialogHeader>
          {dialog?.type !== 'REVOKE' ? (
            <label className="grid gap-2 text-sm font-semibold">
              Scanner label
              <Input value={draftName} maxLength={80} autoFocus
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Gate A scanner" aria-label="Scanner label" />
            </label>
          ) : (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <strong>{dialog?.device?.name ?? 'Selected scanner'}</strong>
              <p className="mt-1 text-xs text-muted-foreground">If this staff member should stop checking in guests entirely, revoke their event access separately.</p>
            </div>
          )}
          {actionError && <p role="alert" className="text-xs text-destructive">{actionError}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={actionBusy} onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="button" disabled={actionBusy || (dialog?.type !== 'REVOKE' && draftName.trim().length < 2)}
              variant={dialog?.type === 'REVOKE' ? 'destructive' : 'default'} onClick={() => void submitDeviceAction()}>
              {actionBusy ? 'Saving…' : dialog?.type === 'REVOKE' ? 'Revoke session' :
                dialog?.type === 'RENAME' ? 'Save name' : 'Register browser'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
