'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Loader2, RotateCcw, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Status = 'starting' | 'ready' | 'failed'

/** Browser-native, on-device capture for manual KYC review. No liveness model,
 * Smile ID transfer, streaming, or upload occurs in this component. */
export function ManualSelfieCamera({ open, onClose, onCaptured }: {
  open: boolean
  onClose: () => void
  onCaptured: (file: File) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<Status>('starting')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [snapping, setSnapping] = useState(false)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) { video.pause(); video.srcObject = null }
  }, [])

  useEffect(() => {
    if (!open) { stopCamera(); return }
    let active = true
    const start = async () => {
      stopCamera()
      setStatus('starting')
      setError('')
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('failed')
        setError('This browser does not support a live camera preview. Use the normal camera/photo option instead.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        })
        if (!active) { stream.getTracks().forEach((track) => track.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {})
          if (!active) return
        }
        setStatus('ready')
      } catch (reason) {
        if (!active) return
        setStatus('failed')
        const name = reason instanceof DOMException ? reason.name : ''
        setError(name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'Camera permission was declined or blocked. Allow camera access in your browser, then retry, or choose a selfie photo instead.'
          : name === 'NotFoundError' ? 'No front camera is available on this device. Select a selfie photo instead.'
          : 'The camera could not start. Close other camera apps or use the photo option instead.')
      }
    }
    void start()
    return () => { active = false; stopCamera() }
  }, [open, attempt, stopCamera])

  const capture = async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight || !streamRef.current || snapping) {
      setError('The camera image is not ready. Try again in a moment.')
      return
    }
    setSnapping(true)
    setError('')
    try {
      const scale = Math.min(1, 1440 / Math.max(video.videoWidth, video.videoHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Image canvas unavailable')
      // Preview is mirrored only to help users align. Preserve unmirrored
      // orientation of the actual evidence photo for human reviewers.
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
      if (!blob || blob.size === 0 || blob.size > 8 * 1024 * 1024) throw new Error('Photo could not be created')
      const file = new File([blob], `identity-selfie-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
      onCaptured(file)
      stopCamera()
      onClose()
    } catch {
      setError('Could not capture your photo. Please retry or choose a photo from your device.')
    } finally { setSnapping(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next) { stopCamera(); onClose() } }}>
    <DialogContent className="max-h-[92dvh] w-[calc(100vw-24px)] max-w-md overflow-y-auto rounded-2xl p-4 sm:p-5">
      <DialogHeader><DialogTitle className="pr-8 text-lg">Take your identity selfie</DialogTitle></DialogHeader>
      <p className="text-xs leading-relaxed text-muted-foreground">Your camera stays on this device while you take the photo. Only after you review the picture, tick the consent checkbox and choose Securely upload selfie will it reach the encrypted manual verification store.</p>
      <div className="relative flex aspect-[4/5] min-h-[230px] max-h-[60dvh] items-center justify-center overflow-hidden rounded-xl bg-slate-950">
        <video ref={videoRef} autoPlay playsInline muted aria-label="Live preview from your front-facing camera" className="h-full w-full object-contain [transform:scaleX(-1)]" />
        {status !== 'ready' && <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 px-4 text-center text-xs text-white/90">
          {status === 'starting' ? <><Loader2 className="size-7 animate-spin" aria-hidden /> Starting camera…</> : <><CameraOff className="size-7" aria-hidden /> Camera not available</>}
        </div>}
      </div>
      {error && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" type="button" className="min-h-11" onClick={() => { stopCamera(); setAttempt((current) => current + 1) }} disabled={snapping}><RotateCcw className="mr-1.5 size-4" /> Retry camera</Button>
        <Button type="button" className="min-h-11" disabled={status !== 'ready' || snapping} onClick={() => void capture()}>{snapping ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Camera className="mr-1.5 size-4" />} Capture photo</Button>
      </div>
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> This is a manual selfie, not a liveness or biometric match. Close this window to use your device camera or choose an existing image instead.</p>
    </DialogContent>
  </Dialog>
}
