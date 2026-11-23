'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, Camera, CameraOff, Loader2, QrCode, Search, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiClientError } from '../api'
import { parseSouvenirScan } from '../lib/souvenir-scan'
import { navigate } from '../router'
import { usePortal } from '../store'

/** A QR scan only navigates to a staff-authenticated read-only receipt.
 * The camera NEVER confirms handover or ticket admission. Receipt-number entry
 * resolves through the server with accepted staff membership and rate limiting. */
export default function SouvenirScannerView() {
  const { booted, user } = usePortal()
  const [scanning, setScanning] = useState(false)
  const [cameraStatus, setCameraStatus] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const detectingRef = useRef(false)
  const lastInvalidRef = useRef('')

  const resolve = useCallback(async (input: string) => {
    if (busy) return
    const parsed = parseSouvenirScan(input, window.location.origin)
    if (!parsed) { setError('This is not an iEventPlux souvenir collection QR or receipt number.'); return }
    setBusy(true)
    setError('')
    try {
      if (parsed.type === 'token') {
        setScanning(false)
        navigate(`/collect/${parsed.token}`)
        return
      }
      const result = await api.post<{ token: string }>('/souvenir-collection/lookup', { reference: parsed.reference })
      setScanning(false)
      navigate(`/collect/${result.token}`)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'The receipt could not be verified. Check the number or your staff access.')
    } finally { setBusy(false) }
  }, [busy])

  useEffect(() => {
    if (!scanning || !booted || !user) return
    let cancelled = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    void (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          setCameraStatus('Camera access requires HTTPS and a compatible browser. Enter a receipt number below, or scan the customer QR with your phone camera app.')
          setScanning(false)
          return
        }
        const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (cancelled) { acquired.getTracks().forEach((track) => track.stop()); return }
        stream = acquired
        const video = videoRef.current
        if (!video) return
        video.srcObject = acquired
        await video.play()
        if (cancelled) return
        const runtime = window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }
        if (!runtime.BarcodeDetector) {
          setCameraStatus('Camera preview active. This browser cannot decode QR codes in-app; use your phone camera app or enter the printed receipt number below.')
          return
        }
        const detector = new runtime.BarcodeDetector({ formats: ['qr_code'] })
        setCameraStatus('Point your rear camera at the customer’s souvenir collection QR. Scanning only opens the receipt; it never collects items automatically.')
        timer = setInterval(() => {
          if (detectingRef.current || !videoRef.current || cancelled) return
          detectingRef.current = true
          void detector.detect(videoRef.current).then((codes) => {
            if (cancelled) return
            const raw = codes[0]?.rawValue
            if (!raw) return
            if (!parseSouvenirScan(raw, window.location.origin)) {
              if (raw !== lastInvalidRef.current) {
                lastInvalidRef.current = raw
                setError('This is not a souvenir receipt QR. Do not use admission-ticket QR codes for merchandise pickup.')
              }
              return
            }
            setScanning(false)
            void resolve(raw)
          }).catch(() => { /* video frame not ready */ }).finally(() => { detectingRef.current = false })
        }, 650)
      } catch {
        if (!cancelled) {
          setCameraStatus('Camera permission was denied or no rear camera is available. Enter the receipt number or open the QR using your phone camera app.')
          setScanning(false)
        }
      }
    })()
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
      if (videoRef.current) videoRef.current.srcObject = null
      detectingRef.current = false
    }
  }, [booted, user, scanning, resolve])

  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void resolve(value) }
  return <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 pb-20">
    <div className="flex items-start gap-3"><span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10"><QrCode className="size-6 text-primary" /></span>
      <div className="min-w-0"><h1 className="text-xl font-extrabold tracking-tight">Souvenir pickup scanner</h1><p className="mt-1 text-xs leading-relaxed text-muted-foreground">For authorized event staff · scan the customer’s QR or enter their printed receipt number</p></div>
    </div>
    {!booted ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking staff session…</p>
      : !user ? <Card className="rounded-xl"><CardContent className="space-y-3 p-5"><p className="text-sm">Sign in with your accepted organizer or check-in staff account before using this scanner.</p><Button className="min-h-11 w-full" onClick={() => navigate('/signin?next=%2Fcollect')}>Staff sign in</Button></CardContent></Card>
      : <>
        <Card className="rounded-xl"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Camera className="size-4 text-primary" /> Scan receipt QR</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {scanning && <div className="overflow-hidden rounded-xl border bg-black"><video ref={videoRef} playsInline muted autoPlay className="aspect-[4/3] w-full object-cover" aria-label="Rear camera preview for souvenir receipt QR scanning" /></div>}
            <Button variant={scanning ? 'outline' : 'default'} className="min-h-11 w-full" disabled={busy} onClick={() => { setError(''); setCameraStatus(''); setScanning((current) => !current) }}>
              {scanning ? <><CameraOff className="mr-2 size-4" /> Stop camera</> : <><Camera className="mr-2 size-4" /> Open rear camera and scan</>}
            </Button>
            {cameraStatus && <p role="status" className="text-xs leading-relaxed text-muted-foreground">{cameraStatus}</p>}
          </CardContent></Card>
        <Card className="rounded-xl"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Search className="size-4 text-primary" /> Enter receipt number or paste QR link</CardTitle></CardHeader><CardContent>
          <form className="space-y-3" onSubmit={submit}><label htmlFor="souvenir-receipt-lookup" className="block text-xs font-semibold">Receipt number / collection QR</label>
            <input id="souvenir-receipt-lookup" name="receipt" className="h-12 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm" placeholder="RCPT-ORD-XXXXXXXX or paste collection QR link" value={value} onChange={(event) => { setValue(event.target.value); setError('') }} maxLength={900} autoComplete="off" required />
            <Button type="submit" className="min-h-11 w-full" disabled={busy || !value.trim()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />} Find paid receipt</Button>
          </form>
        </CardContent></Card>
        {error && <div role="alert" className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertTriangle className="size-5 shrink-0" /> {error}</div>}
        <p className="flex items-start gap-2 rounded-xl border bg-card p-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" /> Scanning only opens the protected receipt. Always verify confirmed payment and remaining quantities, physically hand over the items, then tap Confirm collection. Ticket admission must be scanned separately. A receipt number alone never authorizes handover.</p>
      </>}
  </main>
}
