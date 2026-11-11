'use client'

import { useEffect, useRef } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

/**
 * Synthetic live-stream renderer (DEV fallback).
 *
 * When Cloudflare Stream credentials are absent (VIDEO_PROVIDER=simulator), the
 * player renders a labelled synthetic broadcast: animated stage visuals + live
 * clock + event ticker. Entitlement, playback tokens and session heartbeats are
 * fully enforced — only the video delivery itself is simulated and clearly marked.
 */
export function PlayerSim({
  title,
  orgName,
  offline = false,
  className = '',
}: {
  title: string
  orgName?: string | null
  offline?: boolean
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let t = 0

    const draw = () => {
      const w = (canvas.width = canvas.clientWidth * (window.devicePixelRatio > 2 ? 1.5 : 1))
      const h = (canvas.height = canvas.clientHeight * (window.devicePixelRatio > 2 ? 1.5 : 1))
      t += 0.008

      // Deep stage gradient backdrop.
      const bg = ctx.createLinearGradient(0, 0, w, h)
      bg.addColorStop(0, '#041b13')
      bg.addColorStop(0.5, '#0a3527')
      bg.addColorStop(1, '#3d2a06')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // Swaying light beams.
      for (let i = 0; i < 5; i++) {
        const angle = Math.sin(t * (0.5 + i * 0.13) + i * 1.7) * 0.6
        const x = w * (0.15 + i * 0.18)
        ctx.save()
        ctx.translate(x, -20)
        ctx.rotate(angle)
        const beam = ctx.createLinearGradient(0, 0, 0, h * 1.3)
        const hue = i % 2 === 0 ? 'rgba(52,211,153,' : 'rgba(251,191,36,'
        beam.addColorStop(0, `${hue}0.32)`)
        beam.addColorStop(1, `${hue}0)`)
        ctx.fillStyle = beam
        ctx.fillRect(-w * 0.05, 0, w * 0.1, h * 1.3)
        ctx.restore()
      }

      // Floating particles (audience lights).
      for (let i = 0; i < 26; i++) {
        const px = (Math.sin(t * 0.4 + i * 2.4) * 0.5 + 0.5) * w
        const py = h - ((Math.cos(t * 0.3 + i) * 0.5 + 0.5) * h * 0.55 + h * 0.12)
        const alpha = 0.25 + Math.abs(Math.sin(t * 2 + i)) * 0.6
        ctx.fillStyle = `rgba(253,230,138,${alpha})`
        ctx.beginPath()
        ctx.arc(px, py, 1.6 + Math.sin(t + i) * 1.2, 0, Math.PI * 2)
        ctx.fill()
      }

      // Vignette + subtle scanlines for a broadcast feel.
      const vign = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75)
      vign.addColorStop(0, 'rgba(0,0,0,0)')
      vign.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = vign
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(255,255,255,0.02)'
      for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1)

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-black ${className}`} role="img" aria-label={`Simulated live stream: ${title}`}>
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-destructive px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          <span className="ievx-live-dot" style={{ background: 'white' }} /> {offline ? 'Replay' : 'Live'}
        </span>
        <Badge className="border-white/25 bg-black/40 text-white backdrop-blur">Simulated stream</Badge>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
        <div className="rounded-xl bg-black/45 p-3 backdrop-blur">
          <p className="text-sm font-semibold text-white">{title}</p>
          {orgName && <p className="text-xs text-white/70">{orgName}</p>}
          <p className="mt-1 text-[11px] text-amber-200/90">
            <ShieldAlert className="mr-1 inline h-3 w-3" aria-hidden />
            Synthetic delivery — Cloudflare Stream credentials are not configured on this deployment. Access control is fully live.
          </p>
        </div>
      </div>
    </div>
  )
}
