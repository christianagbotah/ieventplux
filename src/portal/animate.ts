'use client'

/**
 * jQuery-powered view transitions (the portal uses jQuery for DOM-level
 * animation effects alongside React rendering — jQuery only touches wrapper
 * elements that React does not manage, avoiding re-render conflicts).
 */
let jqueryPromise: Promise<typeof import('jquery')> | null = null

async function jq(): Promise<JQueryStatic> {
  if (!jqueryPromise) {
    jqueryPromise = import('jquery')
    // Register jQuery globally for any legacy transition code paths.
    jqueryPromise.then(($mod) => {
      const w = window as unknown as { $?: JQueryStatic; jQuery?: JQueryStatic }
      w.$ = $mod.default
      w.jQuery = $mod.default
    })
  }
  const mod = await jqueryPromise
  return mod.default
}

/** Animate a container out (fade+slide), returning after completion. */
export async function animateOut(el: HTMLElement | null, duration = 160): Promise<void> {
  if (!el) return
  const $ = await jq()
  await new Promise<void>((resolve) => {
    $(el)
      .stop(true)
      .animate({ opacity: 0, marginTop: '-=10px' }, { duration, easing: 'swing', complete: () => resolve() })
  })
}

/** Animate a container in after React has rendered new content. */
export async function animateIn(el: HTMLElement | null, duration = 200): Promise<void> {
  if (!el) return
  const $ = await jq()
  $(el).css({ opacity: 0, marginTop: '10px' })
  await new Promise<void>((resolve) => {
    $(el)
      .stop(true)
      .animate({ opacity: 1, marginTop: '0px' }, { duration, easing: 'easeOutQuad' as never, complete: () => resolve() })
  })
}

/** Subtle highlight flash used after successful actions. */
export async function flash(el: HTMLElement | null): Promise<void> {
  if (!el) return
  const $ = await jq()
  $(el)
    .stop(true, true)
    .css({ boxShadow: '0 0 0 3px rgba(16,185,129,0.45)' })
    .animate({ }, { duration: 60 })
  setTimeout(() => $(el).css({ boxShadow: '' }), 900)
}

/** Count-up animation for stat numbers. */
export async function countUp(el: HTMLElement | null, target: number, duration = 500): Promise<void> {
  if (!el) return
  const $ = await jq()
  const start = Number($(el).data('count-value') ?? 0)
  $(el).data('count-value', target)
  $({ v: start }).animate(
    { v: target },
    {
      duration,
      easing: 'swing',
      step: (now: number) => {
        el.textContent = Math.round(now).toLocaleString()
      },
      complete: () => {
        el.textContent = target.toLocaleString()
      },
    }
  )
}

/** Smooth-scroll a container (used by reels feed + chat). */
export async function scrollToBottom(el: HTMLElement | null, duration = 220): Promise<void> {
  if (!el) return
  const $ = await jq()
  $(el).stop(true).animate({ scrollTop: el.scrollHeight }, { duration, easing: 'swing' })
}
