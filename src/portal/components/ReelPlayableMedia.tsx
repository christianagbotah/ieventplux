'use client'

import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX, Pause, Play } from 'lucide-react'
import { publishedReelVideoSrc } from '../lib/reel-media'

interface Props { src: string; posterUrl: string | null; title: string; active: boolean; pageVisible: boolean }

/** Real browser video only if approved media has a playable platform URL.
 * Off-screen videos never allocate media elements or consume cellular data.
 */
export function ReelPlayableMedia({src,posterUrl,title,active,pageVisible}:Props) {
  const url = publishedReelVideoSrc(src)
  const ref = useRef<HTMLVideoElement>(null)
  const [muted,setMuted] = useState(true)
  const [paused,setPaused] = useState(false)
  const [failed,setFailed] = useState(false)
  const playingAllowed=Boolean(url && active && pageVisible && !paused && !failed)

  useEffect(() => {
    const video=ref.current
    if (!video) return
    if (!playingAllowed) {video.pause();return}
    void video.play().catch(()=>{ /* user gesture/autoplay policy may deny playback */ })
    return ()=>video.pause()
  },[playingAllowed])

  if (!url || !active || !pageVisible || failed) return <>
    {posterUrl ? <img src={posterUrl} alt={`${title} event artwork`} className="h-full w-full object-cover" />
      : <div className="h-full w-full bg-gradient-to-br from-emerald-950 via-slate-900 to-sky-950" />}
    {failed && <div className="absolute inset-x-4 top-16 rounded-xl bg-slate-950/85 p-3 text-center text-xs font-semibold text-white" role="status">Video is unavailable. Event details and photos remain accessible.</div>}
  </>

  return <>
    <video ref={ref} src={url} poster={posterUrl ?? undefined} playsInline loop muted={muted}
      preload="none" className="h-full w-full object-cover" aria-label={`${title} approved event video`}
      onError={()=>setFailed(true)} />
    <div className="absolute right-3 top-14 z-10 flex flex-col gap-2">
      <button type="button" onClick={()=>setMuted(value=>!value)}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-white/40 bg-slate-950/70 px-3 text-xs font-bold text-white backdrop-blur-sm hover:bg-slate-950"
        aria-label={muted?'Turn reel sound on':'Mute reel sound'}>
        {muted?<VolumeX className="size-4" aria-hidden/>:<Volume2 className="size-4" aria-hidden/>}
        {muted?'Sound off':'Sound on'}
      </button>
      <button type="button" onClick={()=>setPaused(value=>!value)}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-white/40 bg-slate-950/70 px-3 text-xs font-bold text-white backdrop-blur-sm hover:bg-slate-950"
        aria-label={paused?'Resume reel video':'Pause reel video'}>
        {paused?<Play className="size-4" aria-hidden/>:<Pause className="size-4" aria-hidden/>}
        {paused?'Play':'Pause'}
      </button>
    </div>
  </>
}
