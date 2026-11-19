'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ShieldCheck, ChevronRight, Loader2, CheckCircle2, RotateCcw, ExternalLink, Lock } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '../api'
import { smileCameraFiles, smileFormData, type SmileVerifiedCapture } from '../lib/smile-capture'

type Stage = 'details' | 'loading-camera' | 'camera' | 'review' | 'sending' | 'sent'

/** Uses Smile ID's official SmartCameraWeb, including its own guided selfie and
 * face-liveness challenges and ID document capture. The browser holds camera
 * images in memory until explicit submission; the server makes the provider call.
 * Never attempt to infer identity by matching faces ourselves.
 */
export function IdentityLiveCapture({ orgId, noticeUrl, onClose, onSubmitted }: {
  orgId: string
  noticeUrl: string
  onClose: () => void
  onSubmitted: () => void
}) {
  const { toast } = useToast()
  const [stage, setStage] = useState<Stage>('details')
  const [givenNames, setGivenNames] = useState('')
  const [lastName, setLastName] = useState('')
  const [consented, setConsented] = useState(false)
  const [error, setError] = useState('')
  const hostRef = useRef<HTMLDivElement>(null)
  const filesRef = useRef<SmileVerifiedCapture | null>(null)
  const busy = stage === 'sending'

  const reset = () => {
    filesRef.current = null
    setError('')
    setStage('details')
    // Explicit consent remains only for this mounted session; closing resets it.
  }
  const close = () => {
    if (busy) return
    filesRef.current = null
    setConsented(false)
    onClose()
  }
  const onPublished = useCallback((event: Event) => {
    try {
      const result = smileCameraFiles((event as CustomEvent<unknown>).detail)
      filesRef.current = result
      setError('')
      setStage('review')
    } catch (reason) {
      filesRef.current = null
      setStage('details')
      setError(reason instanceof Error ? reason.message : 'The camera capture was incomplete. Please retry.')
    }
  }, [])

  useEffect(() => {
    if (stage !== 'camera' || !hostRef.current) return
    const element = document.createElement('smart-camera-web')
    // Set observed attributes after connection: Smile ID's attributeChangedCallback
    // calls setUpEventListeners and assumes its shadow DOM is already mounted.
    element.style.display = 'block'
    element.style.width = '100%'
    element.style.height = '100%'
    const abortCapture = () => {
      filesRef.current = null
      setStage('details')
      setError('Camera capture cancelled. You can restart when ready.')
    }
    element.addEventListener('smart-camera-web.publish', onPublished)
    element.addEventListener('smart-camera-web.cancelled', abortCapture)
    element.addEventListener('smart-camera-web.close', abortCapture)
    const host = hostRef.current
    host.appendChild(element)
    element.setAttribute('capture-id', '')
    element.setAttribute('document-capture-modes', 'camera')
    element.setAttribute('partner-name', 'iEventPlux')
    element.setAttribute('policy-url', noticeUrl)
    element.setAttribute('use-strict-mode', '')
    element.setAttribute('theme-color', '#2563eb')
    element.setAttribute('show-navigation', '')
    element.setAttribute('title', 'Verify your identity')
    return () => {
      element.removeEventListener('smart-camera-web.publish', onPublished)
      element.removeEventListener('smart-camera-web.cancelled', abortCapture)
      element.removeEventListener('smart-camera-web.close', abortCapture)
      element.remove() // SDK disconnectedCallback stops camera tracks.
    }
  }, [stage, noticeUrl, onPublished])

  const startCapture = async () => {
    setError('')
    if (!givenNames.trim() || !lastName.trim()) return setError('Enter your legal given name(s) and surname exactly as printed on your ID.')
    if (givenNames.trim().length > 80 || lastName.trim().length > 80) return setError('Names must not exceed 80 characters.')
    if (!consented) return setError('Separate biometric processing consent is required. You can continue with manual KYC instead.')
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      return setError('A modern camera-enabled browser over HTTPS is required. You can use the manual document upload instead.')
    }
    setStage('loading-camera')
    try {
      // Official browser SDK loads only after a user has consented and opted in.
      await import('@smileid/web-sdk/smart-camera-web')
      if (!window.customElements.get('smart-camera-web')) throw new Error('Smile ID camera is unavailable on this device.')
      setStage('camera')
    } catch {
      setStage('details')
      setError('The Smile ID camera could not load. Check your connection or use manual verification.')
    }
  }

  const sendVerification = async () => {
    const capture = filesRef.current
    if (!capture || !consented || busy) return
    setError('')
    setStage('sending')
    try {
      const body = smileFormData(capture, givenNames, lastName)
      const result = await api.upload<{ job: { id: string; state: string }; note: string }>(`/orgs/${orgId}/identity-checks`, body)
      filesRef.current = null
      setStage('sent')
      toast({ title: 'Identity check submitted', description: result.note })
      onSubmitted()
    } catch (reason) {
      const message = reason instanceof ApiClientError ? reason.message : 'The identity check could not be submitted. Please try again or use manual verification.'
      filesRef.current = null
      setStage('details')
      setError(message)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent className="flex max-h-[95dvh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-3 overflow-y-auto p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-7 text-base"><ShieldCheck className="size-5 text-primary" /> Verify identity with Smile ID</DialogTitle>
          <p className="text-sm text-muted-foreground">Government ID, guided selfie and live face check. Submission does not automatically approve your organizer account.</p>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5 text-xs" aria-label="Verification progress">
          {(['Your details', 'Camera capture', 'Review and send'] as const).map((step, i) => (
            <span key={step} className={'rounded-full px-3 py-1 ' + (i === (stage === 'details' ? 0 : stage === 'camera' || stage === 'loading-camera' ? 1 : 2) ? 'bg-primary/10 font-bold text-primary' : 'bg-secondary text-muted-foreground')}>{i + 1}. {step}</span>
          ))}
        </div>
        {stage === 'details' && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="live-kyc-first">Legal given name(s) *</Label><Input id="live-kyc-first" autoComplete="given-name" value={givenNames} maxLength={80} onChange={(e) => setGivenNames(e.target.value)} placeholder="First and middle names on ID" /></div>
              <div className="space-y-1.5"><Label htmlFor="live-kyc-last">Legal surname *</Label><Input id="live-kyc-last" autoComplete="family-name" value={lastName} maxLength={80} onChange={(e) => setLastName(e.target.value)} placeholder="Surname on ID" /></div>
            </div>
            <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3 sm:p-4">
              <p className="text-sm font-semibold"><Camera className="mr-1.5 inline size-4" /> What you will capture</p>
              <p className="text-xs text-muted-foreground">Smile ID guides you through a live selfie and liveness challenge, followed by the front and back of your identity document. Enable your phone or computer camera when requested. Good lighting and a clear ID improve results.</p>
              <p className="text-xs text-muted-foreground">Images remain in temporary browser memory during this step; iEventPlux does not save them to browser storage or its database. They are sent to Smile ID only after you review the capture and choose Submit.</p>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-xs leading-relaxed">
              <Checkbox checked={consented} onCheckedChange={(checked) => setConsented(checked === true)} />
              <span>I explicitly consent to iEventPlux sending my government ID images, facial image, and guided liveness captures to <strong>Smile ID</strong>, a separate identity-verification provider, for document authenticity checks, facial comparison and liveness analysis. I understand this is separate from manual KYC and can choose manual review instead. <a href={noticeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">Read the biometric privacy notice <ExternalLink className="size-3" aria-hidden /></a>.</span>
            </label>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" /> Live checks may incur provider fees; iEventPlux will not submit unless you choose to send.</p>
            {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={close}>Use manual KYC instead</Button><Button disabled={!consented || !givenNames.trim() || !lastName.trim()} onClick={() => void startCapture()}>Open guided camera <ChevronRight className="ml-1.5 size-4" /></Button></div>
          </div>
        )}
        {stage === 'loading-camera' && <div className="flex min-h-48 flex-col items-center justify-center gap-3"><Loader2 className="size-7 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Loading Smile ID camera securely…</p></div>}
        {stage === 'camera' && (
          <div className="space-y-2">
            <div ref={hostRef} className="h-[min(62dvh,560px)] min-h-[350px] w-full overflow-y-auto rounded-xl border bg-background" aria-label="Smile ID guided live camera capture" />
            <Button variant="outline" size="sm" onClick={reset}>Cancel camera and return to details</Button>
          </div>
        )}
        {stage === 'review' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-5 text-emerald-600" /> Camera capture completed</p>
              <p className="mt-2 text-xs text-muted-foreground">The ID image, selfie and {filesRef.current?.livenessImages.length ?? 0} guided liveness frames are ready. No images have been submitted to the provider yet.</p>
              <p className="mt-2 text-xs text-muted-foreground">Sending begins a real document verification request. Smile ID determines whether it passes. A human reviewer decides final organizer approval.</p>
            </div>
            <DialogFooter><Button variant="outline" disabled={busy} onClick={reset}><RotateCcw className="mr-1.5 size-4" /> Retake</Button><Button disabled={!filesRef.current} onClick={() => void sendVerification()}>Submit to Smile ID <ChevronRight className="ml-1.5 size-4" /></Button></DialogFooter>
          </div>
        )}
        {stage === 'sending' && <div className="flex min-h-48 flex-col items-center justify-center gap-3"><Loader2 className="size-7 animate-spin text-primary" /><p className="text-sm">Sending your consented capture to Smile ID securely…</p></div>}
        {stage === 'sent' && (
          <div className="space-y-4 rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="size-5 text-emerald-600" /> Check submitted successfully</p>
            <p className="text-sm text-muted-foreground">Your request has been accepted for processing, not approved. See your identity-check history for the result. Human review is still required.</p>
            <DialogFooter><Button onClick={close}>Return to verification</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
