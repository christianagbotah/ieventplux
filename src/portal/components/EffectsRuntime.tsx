'use client'

import { cssEffects } from '@/data/css-effects'

/**
 * EffectsRuntime — mounts the entire Effects Studio catalog as a single
 * global stylesheet so every portal view can compose with the same
 * copy-ready `efx-*` classes that the studio demos showcase.
 *
 * The catalog is static data, so the CSS string is computed once at module
 * load. Effects ship with their own `prefers-reduced-motion` fallbacks and
 * are fully scoped under `.efx-<id>` (no leaking selectors), so injecting
 * all of them is safe and keeps a single source of truth with the studio.
 *
 * Theme note: the catalog is authored against light surfaces. The in-app
 * adaptations for dark mode live in `src/app/globals.css` (`.dark .efx-…`).
 */
const ALL_EFFECTS_CSS = cssEffects.map((effect) => effect.cssCode).join('\n')

export function EffectsRuntime() {
  return (
    <style
      data-iefx-runtime="effects-studio-catalog"
      // Static, deterministic string — safe for SSR hydration.
      dangerouslySetInnerHTML={{ __html: ALL_EFFECTS_CSS }}
    />
  )
}
