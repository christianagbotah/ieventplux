'use client'

import { useState } from 'react'
import { ImageOff } from 'lucide-react'

/** The public asset route may be down or an older remote URL may be invalid.
 * Keep the card usable and avoid displaying a browser's broken-image glyph. */
export function OrganizerEventCover({ src, title }: { src?: string | null; title: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-primary/5 sm:size-20">
      {src && !failed ? (
        <img src={src} alt={`Cover for ${title}`} loading="lazy" decoding="async" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <span className="flex flex-col items-center justify-center gap-1 text-center text-muted-foreground" aria-label="No available cover image">
          <ImageOff className="size-5 opacity-75" aria-hidden="true" />
          <span className="text-[10px] leading-tight">No cover</span>
        </span>
      )}
    </div>
  )
}
