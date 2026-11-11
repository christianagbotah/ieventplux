/**
 * iEventPlux — Effects Studio
 * ------------------------------------------------------------------
 * A curated catalog of self-contained, copy-ready CSS effects.
 *
 * Conventions:
 *  - Every selector is scoped under `.efx-<id>` (BEM-ish) so many
 *    effects can safely render on the same page.
 *  - cssCode is 100% vanilla CSS: no Tailwind, no external fonts,
 *    no JavaScript. Keyframe names are also prefixed per effect.
 *  - Animated effects ship with a `prefers-reduced-motion` fallback.
 *  - Palettes favour emerald / amber / rose / teal + neutrals so
 *    demos look premium on white cards.
 */

export type EffectCategory =
  | 'buttons' | 'cards' | 'loaders' | 'text' | 'backgrounds'
  | 'hover' | 'inputs' | 'toggles' | 'navigation' | 'feedback';

export type EffectDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type DemoKind = 'static' | 'interactive';

export interface CSSEffect {
  /** kebab-case slug, unique, e.g. "neon-pulse-button" */
  id: string;
  /** display name */
  name: string;
  category: EffectCategory;
  /** 1-2 sentences, professional tone */
  description: string;
  difficulty: EffectDifficulty;
  /** 2-5 tags like ['glow', 'pulse', 'cta'] */
  tags: string[];
  /** COMPLETE self-contained CSS */
  cssCode: string;
  /** minimal HTML demo markup using the classes */
  htmlSnippet: string;
  /** 'interactive' if driven by :hover/:active/:focus-within/:checked */
  demoKind: DemoKind;
}

export const cssEffects: CSSEffect[] = [
  /* ------------------------------------------------------------------ *
   * BUTTONS
   * ------------------------------------------------------------------ */

  {
    id: 'neon-pulse-button',
    name: 'Neon Pulse Button',
    category: 'buttons',
    description:
      'A high-visibility call-to-action that breathes with an emerald halo, pulling the eye toward primary conversions like ticket purchases. Hover adds a gentle lift while the glow ring expands and fades on a two-second loop.',
    difficulty: 'beginner',
    tags: ['glow', 'pulse', 'cta', 'emerald'],
    demoKind: 'interactive',
    cssCode: `
.efx-neon-pulse-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.95rem 2.4rem;
  border: none;
  border-radius: 999px;
  background: linear-gradient(180deg, #34d399, #059669);
  color: #ffffff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow:
    0 0 0 0 rgba(16, 185, 129, 0.5),
    0 0 16px 2px rgba(16, 185, 129, 0.35),
    0 10px 24px -8px rgba(5, 150, 105, 0.5);
  animation: efx-neon-pulse-button-pulse 2s ease-in-out infinite;
  transition: transform 0.25s ease, filter 0.25s ease;
}

.efx-neon-pulse-button:hover {
  transform: translateY(-2px);
  filter: brightness(1.08);
}

.efx-neon-pulse-button:active {
  transform: translateY(1px) scale(0.97);
}

.efx-neon-pulse-button:focus-visible {
  outline: 3px solid rgba(16, 185, 129, 0.4);
  outline-offset: 3px;
}

@keyframes efx-neon-pulse-button-pulse {
  0%, 100% {
    box-shadow:
      0 0 0 0 rgba(16, 185, 129, 0.5),
      0 0 16px 2px rgba(16, 185, 129, 0.35),
      0 10px 24px -8px rgba(5, 150, 105, 0.5);
  }
  50% {
    box-shadow:
      0 0 0 14px rgba(16, 185, 129, 0),
      0 0 32px 6px rgba(16, 185, 129, 0.55),
      0 14px 30px -8px rgba(5, 150, 105, 0.55);
  }
}

@media (prefers-reduced-motion: reduce) {
  .efx-neon-pulse-button {
    animation: none;
    transition: none;
  }
  .efx-neon-pulse-button:hover,
  .efx-neon-pulse-button:active {
    transform: none;
  }
}
`,
    htmlSnippet: `
<button class="efx-neon-pulse-button" type="button">Buy Tickets — Live Now</button>
`,
  },

  {
    id: 'shine-sweep-button',
    name: 'Shine Sweep Button',
    category: 'buttons',
    description:
      'A golden CTA with a glossy light band that sweeps across the surface on hover, mimicking a specular highlight. Layered warm shadows give the button a premium, tactile feel.',
    difficulty: 'beginner',
    tags: ['shine', 'sweep', 'hover', 'gold'],
    demoKind: 'interactive',
    cssCode: `
.efx-shine-sweep-button {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.95rem 2.3rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #ffffff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 22px -8px rgba(217, 119, 6, 0.55);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.efx-shine-sweep-button::after {
  content: "";
  position: absolute;
  top: -60%;
  left: -80%;
  width: 55%;
  height: 220%;
  background: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.55) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  transform: skewX(-22deg);
  transition: left 0.75s cubic-bezier(0.25, 0.6, 0.3, 1);
  pointer-events: none;
}

.efx-shine-sweep-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 30px -10px rgba(217, 119, 6, 0.6);
}

.efx-shine-sweep-button:hover::after {
  left: 130%;
}

.efx-shine-sweep-button:active {
  transform: translateY(0);
}

.efx-shine-sweep-button:focus-visible {
  outline: 3px solid rgba(245, 158, 11, 0.45);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .efx-shine-sweep-button,
  .efx-shine-sweep-button::after {
    transition: none;
  }
  .efx-shine-sweep-button:hover {
    transform: none;
  }
}
`,
    htmlSnippet: `
<button class="efx-shine-sweep-button" type="button">Reserve Front Row Seats</button>
`,
  },

  {
    id: 'gradient-border-button',
    name: 'Gradient Border Button',
    category: 'buttons',
    description:
      'A transparent-style button wrapped in a living gradient border that flows between emerald, teal, amber and rose. Built with the padding-box/border-box double-background technique — no pseudo-element hacks.',
    difficulty: 'intermediate',
    tags: ['gradient', 'border', 'animated', 'outline'],
    demoKind: 'interactive',
    cssCode: `
.efx-gradient-border-button {
  position: relative;
  display: inline-block;
  padding: 0.85rem 2.2rem;
  border: 2px solid transparent;
  border-radius: 999px;
  background:
    linear-gradient(#ffffff, #ffffff) padding-box,
    linear-gradient(120deg, #10b981, #14b8a6, #f59e0b, #f43f5e, #10b981) border-box;
  background-repeat: no-repeat;
  background-size: 100% 100%, 320% 100%;
  background-position: 0 0, 0% 50%;
  color: #0f766e;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  cursor: pointer;
  animation: efx-gradient-border-button-flow 5s ease-in-out infinite alternate;
  transition: box-shadow 0.35s ease, color 0.35s ease;
}

.efx-gradient-border-button:hover {
  box-shadow: 0 12px 28px -8px rgba(16, 185, 129, 0.45);
  color: #047857;
}

.efx-gradient-border-button:focus-visible {
  outline: 3px solid rgba(20, 184, 166, 0.4);
  outline-offset: 3px;
}

@keyframes efx-gradient-border-button-flow {
  from { background-position: 0 0, 0% 50%; }
  to { background-position: 0 0, 100% 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .efx-gradient-border-button {
    animation: none;
    transition: none;
  }
}
`,
    htmlSnippet: `
<button class="efx-gradient-border-button" type="button">Become a Vendor</button>
`,
  },

  {
    id: '3d-push-button',
    name: '3D Push Button',
    category: 'buttons',
    description:
      'A chunky arcade-style button with a stacked rose base that physically depresses on press. Hover sinks it halfway; :active drives it flush into the page for irresistible tactile feedback.',
    difficulty: 'beginner',
    tags: ['3d', 'press', 'tactile', 'rose'],
    demoKind: 'interactive',
    cssCode: `
.efx-3d-push-button {
  display: inline-block;
  padding: 0.9rem 2.2rem;
  border: none;
  border-radius: 14px;
  background: linear-gradient(180deg, #fb7185, #f43f5e);
  color: #ffffff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 1rem;
  font-weight: 800;
  text-shadow: 0 1px 2px rgba(159, 18, 57, 0.5);
  cursor: pointer;
  transform: translateY(0);
  box-shadow:
    0 7px 0 #be123c,
    0 14px 24px -6px rgba(159, 18, 57, 0.45);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.efx-3d-push-button:hover {
  transform: translateY(3px);
  box-shadow:
    0 4px 0 #be123c,
    0 10px 18px -6px rgba(159, 18, 57, 0.4);
}

.efx-3d-push-button:active {
  transform: translateY(7px);
  box-shadow:
    0 0 0 #be123c,
    0 4px 10px -4px rgba(159, 18, 57, 0.35);
}

.efx-3d-push-button:focus-visible {
  outline: 3px solid rgba(244, 63, 94, 0.4);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .efx-3d-push-button {
    transition: none;
  }
}
`,
    htmlSnippet: `
<button class="efx-3d-push-button" type="button">Claim Early-Bird Pass</button>
`,
  },

  {
    id: 'ripple-click-button',
    name: 'Ripple Click Button',
    category: 'buttons',
    description:
      'A Material-style ink ripple that bursts from the center of the button on every press, then dissolves smoothly on release. Built from a single radial-gradient pseudo-element driven by :active.',
    difficulty: 'intermediate',
    tags: ['ripple', 'material', 'active', 'ink'],
    demoKind: 'interactive',
    cssCode: `
.efx-ripple-click-button {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  display: inline-block;
  padding: 0.95rem 2.4rem;
  border: none;
  border-radius: 12px;
  background: #0f766e;
  color: #ffffff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.25s ease;
}

.efx-ripple-click-button::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: radial-gradient(
    circle at 50% 50%,
    rgba(255, 255, 255, 0.65) 0%,
    rgba(255, 255, 255, 0.28) 42%,
    rgba(255, 255, 255, 0) 68%
  );
  transform: scale(0);
  opacity: 0;
  transition: transform 0.6s cubic-bezier(0.2, 0.6, 0.35, 1), opacity 0.8s ease;
}

.efx-ripple-click-button:active {
  background: #115e59;
}

.efx-ripple-click-button:active::before {
  transform: scale(2.6);
  opacity: 1;
  transition: transform 0.09s ease-out, opacity 0s;
}

.efx-ripple-click-button:focus-visible {
  outline: 3px solid rgba(15, 118, 110, 0.4);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .efx-ripple-click-button,
  .efx-ripple-click-button::before {
    transition: none;
  }
}
`,
    htmlSnippet: `
<button class="efx-ripple-click-button" type="button">Book Stand — Art &amp; Food Fair</button>
`,
  },

  {
    id: 'icon-slide-button',
    name: 'Icon Slide Button',
    category: 'buttons',
    description:
      'A navigation CTA whose arrow icon glides out to the right while a twin slides in from the left, creating an infinite conveyor of motion. The label nudges along to sell the momentum.',
    difficulty: 'intermediate',
    tags: ['icon', 'slide', 'arrow', 'motion'],
    demoKind: 'interactive',
    cssCode: `
.efx-icon-slide-button {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.9rem 1.9rem;
  border: none;
  border-radius: 12px;
  background: #047857;
  color: #ffffff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.3s ease;
}

.efx-icon-slide-button:focus-visible {
  outline: 3px solid rgba(4, 120, 87, 0.4);
  outline-offset: 3px;
}

.efx-icon-slide-button__text {
  transition: transform 0.35s cubic-bezier(0.3, 0.7, 0.3, 1);
}

.efx-icon-slide-button__icons {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15em;
  height: 1.15em;
  overflow: hidden;
}

.efx-icon-slide-button__icon {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transition: transform 0.4s cubic-bezier(0.65, 0, 0.35, 1), opacity 0.4s ease;
}

.efx-icon-slide-button__icon--next {
  transform: translateX(-120%);
  opacity: 0;
}

.efx-icon-slide-button:hover {
  background: #059669;
}

.efx-icon-slide-button:hover .efx-icon-slide-button__text {
  transform: translateX(2px);
}

.efx-icon-slide-button:hover .efx-icon-slide-button__icon--out {
  transform: translateX(120%);
  opacity: 0;
}

.efx-icon-slide-button:hover .efx-icon-slide-button__icon--next {
  transform: translateX(0);
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .efx-icon-slide-button,
  .efx-icon-slide-button__text,
  .efx-icon-slide-button__icon {
    transition: none;
  }
}
`,
    htmlSnippet: `
<button class="efx-icon-slide-button" type="button">
  <span class="efx-icon-slide-button__text">Explore Line-Up</span>
  <span class="efx-icon-slide-button__icons" aria-hidden="true">
    <svg class="efx-icon-slide-button__icon efx-icon-slide-button__icon--out" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
    <svg class="efx-icon-slide-button__icon efx-icon-slide-button__icon--next" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
  </span>
</button>
`,
  },

  /* ------------------------------------------------------------------ *
   * CARDS
   * ------------------------------------------------------------------ */

  {
    id: 'glassmorphism-card',
    name: 'Glassmorphism Card',
    category: 'cards',
    description:
      'A frosted-glass event panel floating over drifting emerald and amber light blobs. backdrop-filter blur plus a translucent white hairline border delivers the premium glassmorphism look.',
    difficulty: 'intermediate',
    tags: ['glass', 'blur', 'frosted', 'premium'],
    demoKind: 'static',
    cssCode: `
.efx-glassmorphism-card {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  padding: 1.75rem;
  background: #06231d;
}

.efx-glassmorphism-card__backdrop {
  position: absolute;
  inset: 0;
}

.efx-glassmorphism-card__backdrop::before,
.efx-glassmorphism-card__backdrop::after {
  content: "";
  position: absolute;
  border-radius: 50%;
  filter: blur(38px);
}

.efx-glassmorphism-card__backdrop::before {
  width: 190px;
  height: 190px;
  left: -40px;
  top: -60px;
  background: #10b981;
  animation: efx-glassmorphism-card-drift-a 9s ease-in-out infinite alternate;
}

.efx-glassmorphism-card__backdrop::after {
  width: 170px;
  height: 170px;
  right: -50px;
  bottom: -55px;
  background: #f59e0b;
  animation: efx-glassmorphism-card-drift-b 11s ease-in-out infinite alternate;
}

.efx-glassmorphism-card__panel {
  position: relative;
  border-radius: 16px;
  padding: 1.4rem 1.5rem;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  box-shadow: 0 18px 36px rgba(2, 20, 15, 0.35);
}

.efx-glassmorphism-card__title {
  margin: 0 0 0.35rem;
  color: #ffffff;
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.efx-glassmorphism-card__meta {
  margin: 0;
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.9rem;
  line-height: 1.55;
}

.efx-glassmorphism-card__badge {
  display: inline-block;
  margin-top: 0.95rem;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 700;
}

@keyframes efx-glassmorphism-card-drift-a {
  to { transform: translate(26px, 22px) scale(1.12); }
}

@keyframes efx-glassmorphism-card-drift-b {
  to { transform: translate(-22px, -18px) scale(1.08); }
}

@media (prefers-reduced-motion: reduce) {
  .efx-glassmorphism-card__backdrop::before,
  .efx-glassmorphism-card__backdrop::after {
    animation: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-glassmorphism-card">
  <div class="efx-glassmorphism-card__backdrop" aria-hidden="true"></div>
  <div class="efx-glassmorphism-card__panel">
    <h4 class="efx-glassmorphism-card__title">Accra Gospel Night</h4>
    <p class="efx-glassmorphism-card__meta">VIP Lounge · Independence Square · Dec 14, 7:00 PM</p>
    <span class="efx-glassmorphism-card__badge">From ₵120</span>
  </div>
</div>
`,
  },

  {
    id: 'tilt-card',
    name: '3D Tilt Card',
    category: 'cards',
    description:
      'A pure-CSS 3D tilt that leans the card toward the cursor on hover while inner elements pop forward on separate translateZ planes. preserve-3d layered depth with zero JavaScript.',
    difficulty: 'intermediate',
    tags: ['3d', 'tilt', 'perspective', 'depth'],
    demoKind: 'interactive',
    cssCode: `
.efx-tilt-card {
  position: relative;
  max-width: 320px;
  margin: 1.5rem auto;
  padding: 1.7rem 1.6rem 1.5rem;
  border-radius: 18px;
  background: linear-gradient(150deg, #ffffff 0%, #ecfdf5 60%, #d1fae5 100%);
  border: 1px solid #a7f3d0;
  box-shadow: 0 12px 32px -12px rgba(5, 150, 105, 0.25);
  transform: perspective(900px) rotateX(0deg) rotateY(0deg);
  transform-style: preserve-3d;
  transition: transform 0.45s cubic-bezier(0.22, 0.9, 0.3, 1), box-shadow 0.45s ease;
  cursor: pointer;
}

.efx-tilt-card:hover {
  transform: perspective(900px) rotateX(7deg) rotateY(-11deg) scale(1.02);
  box-shadow: -20px 26px 44px -14px rgba(5, 150, 105, 0.38);
}

.efx-tilt-card__tag {
  display: inline-block;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  background: #10b981;
  color: #ffffff;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transform: translateZ(36px);
}

.efx-tilt-card__title {
  margin: 0.8rem 0 0.4rem;
  font-size: 1.35rem;
  font-weight: 800;
  color: #064e3b;
  transform: translateZ(48px);
}

.efx-tilt-card__meta {
  margin: 0 0 1.1rem;
  color: #047857;
  font-size: 0.9rem;
  line-height: 1.5;
  transform: translateZ(30px);
}

.efx-tilt-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  transform: translateZ(24px);
}

.efx-tilt-card__price {
  font-weight: 800;
  color: #b45309;
  font-size: 1.05rem;
}

.efx-tilt-card__cta {
  color: #047857;
  font-weight: 700;
  font-size: 0.9rem;
}

@media (prefers-reduced-motion: reduce) {
  .efx-tilt-card {
    transition: none;
  }
  .efx-tilt-card:hover {
    transform: none;
  }
}
`,
    htmlSnippet: `
<article class="efx-tilt-card">
  <span class="efx-tilt-card__tag">Trending</span>
  <h4 class="efx-tilt-card__title">Afrobeat Beach Fest</h4>
  <p class="efx-tilt-card__meta">Laboma Beach · Dec 21 · Gates open 4 PM</p>
  <div class="efx-tilt-card__foot">
    <span class="efx-tilt-card__price">₵180</span>
    <span class="efx-tilt-card__cta">View details →</span>
  </div>
</article>
`,
  },

  {
    id: 'lift-hover-card',
    name: 'Lift Hover Card',
    category: 'cards',
    description:
      'A crisp white event card that floats upward on hover with a layered teal shadow and a growing accent bar. The quiet workhorse of any premium card grid.',
    difficulty: 'beginner',
    tags: ['lift', 'shadow', 'hover', 'clean'],
    demoKind: 'interactive',
    cssCode: `
.efx-lift-hover-card {
  max-width: 320px;
  margin: 1.25rem auto;
  padding: 1.5rem;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 14px -6px rgba(15, 23, 42, 0.12);
  transition:
    transform 0.35s cubic-bezier(0.22, 0.9, 0.3, 1),
    box-shadow 0.35s ease,
    border-color 0.35s ease;
  cursor: pointer;
}

.efx-lift-hover-card:hover {
  transform: translateY(-10px);
  border-color: #99f6e4;
  box-shadow:
    0 26px 48px -14px rgba(13, 148, 136, 0.35),
    0 6px 14px -8px rgba(13, 148, 136, 0.18);
}

.efx-lift-hover-card__bar {
  height: 5px;
  width: 44px;
  border-radius: 999px;
  background: linear-gradient(90deg, #14b8a6, #f59e0b);
  margin-bottom: 1rem;
  transition: width 0.4s cubic-bezier(0.22, 0.9, 0.3, 1);
}

.efx-lift-hover-card:hover .efx-lift-hover-card__bar {
  width: 90px;
}

.efx-lift-hover-card__title {
  margin: 0 0 0.35rem;
  font-size: 1.2rem;
  font-weight: 800;
  color: #134e4a;
}

.efx-lift-hover-card__meta {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
  line-height: 1.55;
}

.efx-lift-hover-card__link {
  display: inline-block;
  margin-top: 1rem;
  font-weight: 700;
  font-size: 0.9rem;
  color: #0d9488;
  transition: color 0.3s ease, transform 0.3s ease;
}

.efx-lift-hover-card:hover .efx-lift-hover-card__link {
  color: #0f766e;
  transform: translateX(4px);
}

@media (prefers-reduced-motion: reduce) {
  .efx-lift-hover-card,
  .efx-lift-hover-card__bar,
  .efx-lift-hover-card__link {
    transition: none;
  }
  .efx-lift-hover-card:hover {
    transform: none;
  }
}
`,
    htmlSnippet: `
<article class="efx-lift-hover-card">
  <div class="efx-lift-hover-card__bar" aria-hidden="true"></div>
  <h4 class="efx-lift-hover-card__title">Soweto Jazz &amp; Soul Brunch</h4>
  <p class="efx-lift-hover-card__meta">Sunset sessions with live horns, bottomless brunch and a vinyl-only DJ set.</p>
  <span class="efx-lift-hover-card__link">See the menu →</span>
</article>
`,
  },

  {
    id: 'flip-card',
    name: 'Flip Card',
    category: 'cards',
    description:
      'A dual-faced event card that rotates 180° in 3D on hover — or on keyboard focus — to reveal pricing and perks on the back. backface-visibility keeps the hidden face cleanly out of sight.',
    difficulty: 'intermediate',
    tags: ['flip', '3d', 'reveal', 'hover'],
    demoKind: 'interactive',
    cssCode: `
.efx-flip-card {
  max-width: 320px;
  margin: 1.25rem auto;
  height: 240px;
  perspective: 1100px;
}

.efx-flip-card__inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.7s cubic-bezier(0.4, 0.15, 0.2, 1);
}

.efx-flip-card:hover .efx-flip-card__inner,
.efx-flip-card:focus-within .efx-flip-card__inner {
  transform: rotateY(180deg);
}

.efx-flip-card__face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.3rem;
  padding: 1.4rem;
  border-radius: 18px;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  overflow: hidden;
}

.efx-flip-card__face--front {
  background:
    radial-gradient(circle at 82% 14%, rgba(255, 255, 255, 0.28), transparent 45%),
    linear-gradient(150deg, #047857, #10b981 55%, #2dd4bf);
  color: #ffffff;
  box-shadow: 0 16px 34px -14px rgba(5, 150, 105, 0.5);
}

.efx-flip-card__face--back {
  transform: rotateY(180deg);
  justify-content: center;
  background: #ffffff;
  border: 1.5px solid #a7f3d0;
  color: #0f172a;
  box-shadow: 0 16px 34px -14px rgba(5, 150, 105, 0.35);
}

.efx-flip-card__hint {
  position: absolute;
  top: 1rem;
  right: 1rem;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: #ffffff;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.efx-flip-card__kicker {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.9;
}

.efx-flip-card__title {
  margin: 0;
  font-size: 1.45rem;
  font-weight: 800;
  line-height: 1.2;
}

.efx-flip-card__meta {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.88;
}

.efx-flip-card__perks {
  margin: 0 0 1rem;
  padding: 0 0 0 1.1rem;
  color: #334155;
  font-size: 0.88rem;
  line-height: 1.7;
}

.efx-flip-card__price {
  display: block;
  margin-bottom: 0.8rem;
  font-size: 1.2rem;
  font-weight: 800;
  color: #b45309;
}

.efx-flip-card__cta {
  align-self: flex-start;
  padding: 0.6rem 1.4rem;
  border: none;
  border-radius: 999px;
  background: linear-gradient(180deg, #34d399, #059669);
  color: #ffffff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 18px -8px rgba(5, 150, 105, 0.6);
}

@media (prefers-reduced-motion: reduce) {
  .efx-flip-card__inner {
    transition: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-flip-card">
  <div class="efx-flip-card__inner">
    <div class="efx-flip-card__face efx-flip-card__face--front">
      <span class="efx-flip-card__hint">Hover to flip</span>
      <span class="efx-flip-card__kicker">Festival Pass</span>
      <h4 class="efx-flip-card__title">Reggae on the Ridge</h4>
      <p class="efx-flip-card__meta">Aburi Hills · Jan 4 · Gates 2 PM</p>
    </div>
    <div class="efx-flip-card__face efx-flip-card__face--back">
      <ul class="efx-flip-card__perks">
        <li>Live dub sound system till midnight</li>
        <li>Hilltop food village &amp; rum bar</li>
        <li>Free shuttle from Accra Mall</li>
      </ul>
      <span class="efx-flip-card__price">₵95 · VIP ₵160</span>
      <button class="efx-flip-card__cta" type="button">Get Tickets</button>
    </div>
  </div>
</div>
`,
  },

  {
    id: 'spotlight-hover-card',
    name: 'Spotlight Hover Card',
    category: 'cards',
    description:
      'A dark card stage where an amber spotlight blooms from the top corner on hover, traced by a matching gradient rim built with mask-composite. Feels like a stage light hitting the headliner.',
    difficulty: 'advanced',
    tags: ['spotlight', 'radial', 'glow', 'mask'],
    demoKind: 'interactive',
    cssCode: `
.efx-spotlight-hover-card {
  position: relative;
  overflow: hidden;
  max-width: 320px;
  margin: 1.25rem auto;
  padding: 1.6rem 1.5rem 1.4rem;
  border-radius: 18px;
  background: #0f172a;
  border: 1px solid #1e293b;
  color: #e2e8f0;
  cursor: pointer;
  transition: border-color 0.45s ease;
}

.efx-spotlight-hover-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    420px circle at 75% 12%,
    rgba(245, 158, 11, 0.3),
    rgba(245, 158, 11, 0.07) 45%,
    transparent 65%
  );
  opacity: 0;
  transition: opacity 0.45s ease;
  pointer-events: none;
}

.efx-spotlight-hover-card::after {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1.5px;
  background: radial-gradient(
    260px circle at 75% 12%,
    rgba(251, 191, 36, 0.9),
    rgba(251, 191, 36, 0.25) 45%,
    transparent 65%
  );
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.45s ease;
  pointer-events: none;
}

.efx-spotlight-hover-card:hover {
  border-color: rgba(251, 191, 36, 0.35);
}

.efx-spotlight-hover-card:hover::before,
.efx-spotlight-hover-card:hover::after {
  opacity: 1;
}

.efx-spotlight-hover-card__kicker {
  display: block;
  margin-bottom: 0.45rem;
  color: #fbbf24;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.efx-spotlight-hover-card__title {
  margin: 0 0 0.4rem;
  color: #ffffff;
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1.25;
}

.efx-spotlight-hover-card__meta {
  margin: 0 0 1.1rem;
  color: #94a3b8;
  font-size: 0.9rem;
  line-height: 1.55;
}

.efx-spotlight-hover-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.efx-spotlight-hover-card__price {
  color: #fbbf24;
  font-weight: 800;
}

.efx-spotlight-hover-card__cta {
  color: #f8fafc;
  font-weight: 700;
  font-size: 0.85rem;
  opacity: 0.75;
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.efx-spotlight-hover-card:hover .efx-spotlight-hover-card__cta {
  opacity: 1;
  transform: translateX(4px);
}

@media (prefers-reduced-motion: reduce) {
  .efx-spotlight-hover-card,
  .efx-spotlight-hover-card::before,
  .efx-spotlight-hover-card::after,
  .efx-spotlight-hover-card__cta {
    transition: none;
  }
}
`,
    htmlSnippet: `
<article class="efx-spotlight-hover-card">
  <span class="efx-spotlight-hover-card__kicker">Tonight · Headliner</span>
  <h4 class="efx-spotlight-hover-card__title">Night Market Food Fair</h4>
  <p class="efx-spotlight-hover-card__meta">40+ kitchens, live highlife bands and a rooftop cocktail deck.</p>
  <div class="efx-spotlight-hover-card__foot">
    <span class="efx-spotlight-hover-card__price">From ₵40</span>
    <span class="efx-spotlight-hover-card__cta">Grab a table →</span>
  </div>
</article>
`,
  },

  /* ------------------------------------------------------------------ *
   * LOADERS
   * ------------------------------------------------------------------ */

  {
    id: 'orbit-dots-loader',
    name: 'Orbit Dots Loader',
    category: 'loaders',
    description:
      'Four colored dots chase each other around a circular orbit, shrinking at the far side to fake depth. A friendly, brandable loading state for ticket queues.',
    difficulty: 'beginner',
    tags: ['orbit', 'dots', 'spinner', 'queue'],
    demoKind: 'static',
    cssCode: `
.efx-orbit-dots-loader {
  position: relative;
  width: 68px;
  height: 68px;
  margin: 1.5rem auto;
}

.efx-orbit-dots-loader::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border-radius: 50%;
  background: #cbd5e1;
}

.efx-orbit-dots-loader__dot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 11px;
  height: 11px;
  margin: -5.5px 0 0 -5.5px;
  border-radius: 50%;
  animation: efx-orbit-dots-loader-orbit 1.6s cubic-bezier(0.45, 0.1, 0.55, 0.9) infinite;
}

.efx-orbit-dots-loader__dot:nth-child(1) { background: #10b981; }
.efx-orbit-dots-loader__dot:nth-child(2) { background: #f59e0b; animation-delay: -0.2s; }
.efx-orbit-dots-loader__dot:nth-child(3) { background: #f43f5e; animation-delay: -0.4s; }
.efx-orbit-dots-loader__dot:nth-child(4) { background: #14b8a6; animation-delay: -0.6s; }

.efx-orbit-dots-loader__label {
  margin: 0.9rem 0 0;
  text-align: center;
  color: #64748b;
  font-size: 0.82rem;
  font-weight: 600;
}

@keyframes efx-orbit-dots-loader-orbit {
  0% { transform: rotate(0deg) translateY(-27px) scale(1); }
  50% { transform: rotate(180deg) translateY(-27px) scale(0.72); }
  100% { transform: rotate(360deg) translateY(-27px) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .efx-orbit-dots-loader__dot {
    animation: none;
  }
  .efx-orbit-dots-loader__dot:nth-child(1) { transform: rotate(0deg) translateY(-27px); }
  .efx-orbit-dots-loader__dot:nth-child(2) { transform: rotate(90deg) translateY(-27px); }
  .efx-orbit-dots-loader__dot:nth-child(3) { transform: rotate(180deg) translateY(-27px); }
  .efx-orbit-dots-loader__dot:nth-child(4) { transform: rotate(270deg) translateY(-27px); }
}
`,
    htmlSnippet: `
<div class="efx-orbit-dots-loader" role="status">
  <span class="efx-orbit-dots-loader__dot" aria-hidden="true"></span>
  <span class="efx-orbit-dots-loader__dot" aria-hidden="true"></span>
  <span class="efx-orbit-dots-loader__dot" aria-hidden="true"></span>
  <span class="efx-orbit-dots-loader__dot" aria-hidden="true"></span>
</div>
<p class="efx-orbit-dots-loader__label">Reserving your seats…</p>
`,
  },

  {
    id: 'dual-ring-loader',
    name: 'Dual Ring Loader',
    category: 'loaders',
    description:
      'Two concentric rings counter-rotate at different speeds — a teal outer and an amber inner — creating a hypnotic mechanical spinner for short waits.',
    difficulty: 'beginner',
    tags: ['ring', 'spinner', 'dual', 'counter-rotate'],
    demoKind: 'static',
    cssCode: `
.efx-dual-ring-loader {
  position: relative;
  width: 66px;
  height: 66px;
  margin: 1.5rem auto;
  border-radius: 50%;
  border: 6px solid rgba(20, 184, 166, 0.18);
  border-top-color: #0d9488;
  animation: efx-dual-ring-loader-cw 1.15s linear infinite;
}

.efx-dual-ring-loader::after {
  content: "";
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  border: 5px solid rgba(245, 158, 11, 0.2);
  border-bottom-color: #f59e0b;
  animation: efx-dual-ring-loader-ccw 0.9s linear infinite;
}

.efx-dual-ring-loader__label {
  margin: 1rem 0 0;
  text-align: center;
  color: #64748b;
  font-size: 0.82rem;
  font-weight: 600;
}

@keyframes efx-dual-ring-loader-cw {
  to { transform: rotate(360deg); }
}

@keyframes efx-dual-ring-loader-ccw {
  to { transform: rotate(-360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .efx-dual-ring-loader,
  .efx-dual-ring-loader::after {
    animation: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-dual-ring-loader" role="status" aria-label="Loading line-up"></div>
<p class="efx-dual-ring-loader__label">Loading line-up…</p>
`,
  },

  {
    id: 'skeleton-shimmer',
    name: 'Skeleton Shimmer',
    category: 'loaders',
    description:
      'A card-shaped loading skeleton whose ghost blocks shimmer with a traveling highlight wave. The industry-standard pattern for perceived speed while event data loads.',
    difficulty: 'beginner',
    tags: ['skeleton', 'shimmer', 'loading', 'placeholder'],
    demoKind: 'static',
    cssCode: `
.efx-skeleton-shimmer {
  max-width: 300px;
  margin: 1.25rem auto;
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
}

.efx-skeleton-shimmer__thumb,
.efx-skeleton-shimmer__line {
  border-radius: 8px;
  background: linear-gradient(90deg, #eef2f7 25%, #e2e8f0 37%, #eef2f7 63%);
  background-size: 400% 100%;
  background-repeat: no-repeat;
  animation: efx-skeleton-shimmer-wave 1.4s ease-in-out infinite;
}

.efx-skeleton-shimmer__thumb {
  height: 110px;
  border-radius: 12px;
}

.efx-skeleton-shimmer__line {
  height: 14px;
  margin-top: 0.85rem;
}

.efx-skeleton-shimmer__line--wide { width: 92%; }
.efx-skeleton-shimmer__line--short { width: 55%; }

@keyframes efx-skeleton-shimmer-wave {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .efx-skeleton-shimmer__thumb,
  .efx-skeleton-shimmer__line {
    animation: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-skeleton-shimmer" role="status" aria-label="Loading event card">
  <div class="efx-skeleton-shimmer__thumb" aria-hidden="true"></div>
  <div class="efx-skeleton-shimmer__line efx-skeleton-shimmer__line--wide" aria-hidden="true"></div>
  <div class="efx-skeleton-shimmer__line" aria-hidden="true"></div>
  <div class="efx-skeleton-shimmer__line efx-skeleton-shimmer__line--short" aria-hidden="true"></div>
</div>
`,
  },

  {
    id: 'pie-spinner',
    name: 'Pie Spinner',
    category: 'loaders',
    description:
      'A donut that fills itself like a radar sweep using an animated custom property feeding a conic-gradient. Showcases the modern @property technique for interpolating angles.',
    difficulty: 'intermediate',
    tags: ['conic', 'pie', 'progress', 'property'],
    demoKind: 'static',
    cssCode: `
@property --efx-pie-spinner-fill {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

.efx-pie-spinner {
  position: relative;
  width: 62px;
  height: 62px;
  margin: 1.5rem auto;
  border-radius: 50%;
  background: conic-gradient(#f59e0b var(--efx-pie-spinner-fill), rgba(245, 158, 11, 0.16) 0);
  animation: efx-pie-spinner-grow 2s cubic-bezier(0.45, 0.05, 0.35, 1) infinite;
}

.efx-pie-spinner::after {
  content: "";
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: inset 0 2px 6px rgba(180, 83, 9, 0.28);
}

.efx-pie-spinner__label {
  margin: 1rem 0 0;
  text-align: center;
  color: #64748b;
  font-size: 0.82rem;
  font-weight: 600;
}

@keyframes efx-pie-spinner-grow {
  0% { --efx-pie-spinner-fill: 0deg; }
  78% { --efx-pie-spinner-fill: 360deg; }
  100% { --efx-pie-spinner-fill: 360deg; }
}

@media (prefers-reduced-motion: reduce) {
  .efx-pie-spinner {
    --efx-pie-spinner-fill: 252deg;
    animation: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-pie-spinner" role="status" aria-label="Checking availability"></div>
<p class="efx-pie-spinner__label">Checking availability…</p>
`,
  },

  {
    id: 'progress-stripes-loader',
    name: 'Progress Stripes Loader',
    category: 'loaders',
    description:
      'A classic barber-pole progress bar: emerald diagonal stripes glide seamlessly along the track while a live percentage reads out below.',
    difficulty: 'beginner',
    tags: ['stripes', 'progress', 'barber-pole'],
    demoKind: 'static',
    cssCode: `
.efx-progress-stripes-loader {
  max-width: 320px;
  margin: 1.5rem auto;
}

.efx-progress-stripes-loader__track {
  height: 20px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
  box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.12);
}

.efx-progress-stripes-loader__bar {
  height: 100%;
  width: 72%;
  border-radius: inherit;
  background: repeating-linear-gradient(
    45deg,
    #059669 0 12px,
    #34d399 12px 24px
  );
  animation: efx-progress-stripes-loader-slide 0.7s linear infinite;
}

.efx-progress-stripes-loader__meta {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  color: #475569;
  font-size: 0.8rem;
  font-weight: 600;
}

@keyframes efx-progress-stripes-loader-slide {
  to { background-position: 33.94px 0; }
}

@media (prefers-reduced-motion: reduce) {
  .efx-progress-stripes-loader__bar {
    animation: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-progress-stripes-loader" role="status">
  <div class="efx-progress-stripes-loader__track">
    <div class="efx-progress-stripes-loader__bar" aria-hidden="true"></div>
  </div>
  <div class="efx-progress-stripes-loader__meta">
    <span>Uploading gallery…</span>
    <span>72%</span>
  </div>
</div>
`,
  },

  /* ------------------------------------------------------------------ *
   * TEXT
   * ------------------------------------------------------------------ */

  {
    id: 'animated-gradient-text',
    name: 'Animated Gradient Text',
    category: 'text',
    description:
      'Headline text filled with a flowing emerald-to-amber-to-rose gradient that pans continuously. background-clip: text does the painting; the gradient does the dancing.',
    difficulty: 'beginner',
    tags: ['gradient', 'text', 'clip', 'animated'],
    demoKind: 'static',
    cssCode: `
.efx-animated-gradient-text {
  display: inline-block;
  margin: 1.25rem 0;
  font-size: 2.1rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1.2;
  background: linear-gradient(90deg, #0d9488, #10b981, #f59e0b, #f43f5e, #0d9488);
  background-size: 250% 100%;
  background-repeat: no-repeat;
  background-position: 0% 50%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  animation: efx-animated-gradient-text-pan 7s ease-in-out infinite alternate;
}

@keyframes efx-animated-gradient-text-pan {
  from { background-position: 0% 50%; }
  to { background-position: 100% 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .efx-animated-gradient-text {
    animation: none;
  }
}
`,
    htmlSnippet: `
<h3 class="efx-animated-gradient-text">Feel the Beat Live</h3>
`,
  },

  {
    id: 'typewriter-text',
    name: 'Typewriter Text',
    category: 'text',
    description:
      'A terminal-style announcement line that types itself out character-by-character using steps() timing, holds for reading, then backspaces to loop. The caret blinks independently.',
    difficulty: 'intermediate',
    tags: ['typewriter', 'steps', 'caret', 'terminal'],
    demoKind: 'static',
    cssCode: `
.efx-typewriter-text {
  max-width: 360px;
  margin: 1.5rem auto;
  padding: 1.2rem 1.3rem;
  border-radius: 14px;
  background: linear-gradient(160deg, #0f172a, #1e293b);
  box-shadow: 0 16px 32px -16px rgba(15, 23, 42, 0.5);
}

.efx-typewriter-text::before {
  content: "❯ ";
  color: #f59e0b;
  font-weight: 700;
}

.efx-typewriter-text__line {
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  vertical-align: bottom;
  width: 0;
  border-right: 2px solid #34d399;
  color: #a7f3d0;
  font-family: "Courier New", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  animation:
    efx-typewriter-text-typing 6s steps(24, end) infinite,
    efx-typewriter-text-caret 0.8s step-end infinite;
}

@keyframes efx-typewriter-text-typing {
  0% { width: 0; }
  42% { width: 24ch; }
  74% { width: 24ch; }
  100% { width: 0; }
}

@keyframes efx-typewriter-text-caret {
  0%, 100% { border-color: #34d399; }
  50% { border-color: transparent; }
}

@media (prefers-reduced-motion: reduce) {
  .efx-typewriter-text__line {
    width: 24ch;
    border-right-color: #34d399;
    animation: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-typewriter-text">
  <span class="efx-typewriter-text__line">Doors open at 7PM sharp!</span>
</div>
`,
  },

  {
    id: 'neon-glow-text',
    name: 'Neon Glow Text',
    category: 'text',
    description:
      'A rose neon sign that breathes with layered text-shadows and the occasional realistic flicker. Presented on its own dark stage so the glow can really sing.',
    difficulty: 'intermediate',
    tags: ['neon', 'glow', 'text-shadow', 'sign'],
    demoKind: 'static',
    cssCode: `
.efx-neon-glow-text {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 1.5rem auto;
  padding: 2.1rem 1.5rem;
  border-radius: 16px;
  background: #0b1020;
  box-shadow: inset 0 0 60px rgba(244, 63, 94, 0.14);
}

.efx-neon-glow-text__word {
  margin: 0;
  font-size: 2.4rem;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #ffe4e6;
  text-shadow:
    0 0 8px rgba(244, 63, 94, 0.9),
    0 0 22px rgba(244, 63, 94, 0.65),
    0 0 48px rgba(244, 63, 94, 0.45),
    0 0 90px rgba(244, 63, 94, 0.3);
  animation:
    efx-neon-glow-text-breathe 2.6s ease-in-out infinite alternate,
    efx-neon-glow-text-flicker 7s linear infinite;
}

@keyframes efx-neon-glow-text-breathe {
  from {
    text-shadow:
      0 0 8px rgba(244, 63, 94, 0.7),
      0 0 20px rgba(244, 63, 94, 0.5),
      0 0 44px rgba(244, 63, 94, 0.35);
  }
  to {
    text-shadow:
      0 0 10px rgba(244, 63, 94, 1),
      0 0 32px rgba(244, 63, 94, 0.8),
      0 0 68px rgba(244, 63, 94, 0.6),
      0 0 110px rgba(244, 63, 94, 0.4);
  }
}

@keyframes efx-neon-glow-text-flicker {
  0%, 100% { opacity: 1; }
  3% { opacity: 0.55; }
  5% { opacity: 1; }
  42% { opacity: 1; }
  44% { opacity: 0.4; }
  46% { opacity: 1; }
  47% { opacity: 0.75; }
  49% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .efx-neon-glow-text__word {
    animation: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-neon-glow-text">
  <h3 class="efx-neon-glow-text__word">Live Now</h3>
</div>
`,
  },

  {
    id: 'wavy-text',
    name: 'Wavy Text',
    category: 'text',
    description:
      'Each letter bobs, tilts and settles in a staggered wave driven by per-letter nth-child animation delays. A playful festival headline treatment.',
    difficulty: 'beginner',
    tags: ['wave', 'bounce', 'letters', 'playful'],
    demoKind: 'static',
    cssCode: `
.efx-wavy-text {
  margin: 1.75rem auto;
  text-align: center;
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: 0.02em;
  line-height: 1.4;
}

.efx-wavy-text__char {
  display: inline-block;
  color: #0d9488;
  animation: efx-wavy-text-bob 1.5s ease-in-out infinite;
}

.efx-wavy-text__char:nth-child(odd) { color: #0f766e; }
.efx-wavy-text__char:nth-child(3n) { color: #f59e0b; }

.efx-wavy-text__char:nth-child(1) { animation-delay: 0s; }
.efx-wavy-text__char:nth-child(2) { animation-delay: 0.08s; }
.efx-wavy-text__char:nth-child(3) { animation-delay: 0.16s; }
.efx-wavy-text__char:nth-child(4) { animation-delay: 0.24s; }
.efx-wavy-text__char:nth-child(5) { animation-delay: 0.32s; }
.efx-wavy-text__char:nth-child(6) { animation-delay: 0.4s; }
.efx-wavy-text__char:nth-child(7) { animation-delay: 0.48s; }
.efx-wavy-text__char:nth-child(8) { animation-delay: 0.56s; }
.efx-wavy-text__char:nth-child(9) { animation-delay: 0.64s; }
.efx-wavy-text__char:nth-child(10) { animation-delay: 0.72s; }
.efx-wavy-text__char:nth-child(11) { animation-delay: 0.8s; }
.efx-wavy-text__char:nth-child(12) { animation-delay: 0.88s; }
.efx-wavy-text__char:nth-child(13) { animation-delay: 0.96s; }

@keyframes efx-wavy-text-bob {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  30% { transform: translateY(-9px) rotate(-4deg); }
  60% { transform: translateY(2px) rotate(3deg); }
}

@media (prefers-reduced-motion: reduce) {
  .efx-wavy-text__char {
    animation: none;
  }
}
`,
    htmlSnippet: `
<h3 class="efx-wavy-text" aria-label="Afrobeat Fest">
  <span class="efx-wavy-text__char">A</span><span class="efx-wavy-text__char">f</span><span class="efx-wavy-text__char">r</span><span class="efx-wavy-text__char">o</span><span class="efx-wavy-text__char">b</span><span class="efx-wavy-text__char">e</span><span class="efx-wavy-text__char">a</span><span class="efx-wavy-text__char">t</span><span class="efx-wavy-text__char">&nbsp;</span><span class="efx-wavy-text__char">F</span><span class="efx-wavy-text__char">e</span><span class="efx-wavy-text__char">s</span><span class="efx-wavy-text__char">t</span>
</h3>
`,
  },

  /* ------------------------------------------------------------------ *
   * BACKGROUNDS
   * ------------------------------------------------------------------ */

  {
    id: 'aurora-bg',
    name: 'Aurora Background',
    category: 'backgrounds',
    description:
      'Slow-swirling teal and amber aurora ribbons drift across a deep night sky dotted with faint stars, blurred into soft light veils. A moody hero backdrop for headline acts.',
    difficulty: 'advanced',
    tags: ['aurora', 'blur', 'ambient', 'hero'],
    demoKind: 'static',
    cssCode: `
.efx-aurora-bg {
  position: relative;
  overflow: hidden;
  min-height: 210px;
  border-radius: 18px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background-color: #031a15;
  background-image:
    radial-gradient(circle 1.6px at 18% 26%, rgba(255, 255, 255, 0.75) 30%, transparent 70%),
    radial-gradient(circle 1.2px at 64% 18%, rgba(255, 255, 255, 0.5) 30%, transparent 70%),
    radial-gradient(circle 1.4px at 82% 40%, rgba(255, 255, 255, 0.65) 30%, transparent 70%),
    radial-gradient(circle 1.1px at 38% 12%, rgba(255, 255, 255, 0.45) 30%, transparent 70%),
    radial-gradient(circle 1.3px at 55% 60%, rgba(255, 255, 255, 0.35) 30%, transparent 70%),
    radial-gradient(circle 1.1px at 28% 74%, rgba(255, 255, 255, 0.4) 30%, transparent 70%);
}

.efx-aurora-bg::before,
.efx-aurora-bg::after {
  content: "";
  position: absolute;
  top: -40%;
  left: -12%;
  width: 78%;
  height: 130%;
  background: linear-gradient(
    115deg,
    rgba(16, 185, 129, 0.6),
    rgba(45, 212, 191, 0.25) 55%,
    transparent 75%
  );
  filter: blur(26px);
  transform-origin: top center;
  animation: efx-aurora-bg-sway 8s ease-in-out infinite alternate;
}

.efx-aurora-bg::after {
  left: auto;
  right: -18%;
  width: 68%;
  background: linear-gradient(
    245deg,
    rgba(245, 158, 11, 0.45),
    rgba(251, 191, 36, 0.15) 50%,
    transparent 72%
  );
  transform-origin: top right;
  animation: efx-aurora-bg-sway-alt 11s ease-in-out infinite alternate;
}

.efx-aurora-bg__content {
  position: relative;
}

.efx-aurora-bg__kicker {
  display: block;
  margin-bottom: 0.4rem;
  color: #fbbf24;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.efx-aurora-bg__title {
  margin: 0 0 0.3rem;
  color: #ffffff;
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.efx-aurora-bg__meta {
  margin: 0;
  color: rgba(226, 232, 240, 0.75);
  font-size: 0.9rem;
}

@keyframes efx-aurora-bg-sway {
  from { transform: rotate(-6deg) translateX(-6%) scaleY(1); }
  to { transform: rotate(5deg) translateX(8%) scaleY(1.15); }
}

@keyframes efx-aurora-bg-sway-alt {
  from { transform: rotate(6deg) translateX(5%) scaleY(1.1); }
  to { transform: rotate(-5deg) translateX(-7%) scaleY(0.95); }
}

@media (prefers-reduced-motion: reduce) {
  .efx-aurora-bg::before,
  .efx-aurora-bg::after {
    animation: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-aurora-bg">
  <div class="efx-aurora-bg__content">
    <span class="efx-aurora-bg__kicker">Main Stage</span>
    <h4 class="efx-aurora-bg__title">Aurora Arena</h4>
    <p class="efx-aurora-bg__meta">Live sets till dawn · Dec 28 · Lakeside Park</p>
  </div>
</div>
`,
  },

  {
    id: 'animated-grid-bg',
    name: 'Animated Grid Background',
    category: 'backgrounds',
    description:
      'An infinitely panning blueprint grid, faded at the edges with a radial mask, plus a pulsing venue pin. Perfect for floor plans and map-flavored UI.',
    difficulty: 'intermediate',
    tags: ['grid', 'pan', 'mask', 'map'],
    demoKind: 'static',
    cssCode: `
.efx-animated-grid-bg {
  position: relative;
  overflow: hidden;
  height: 210px;
  border-radius: 18px;
  background-color: #f8fafc;
  display: flex;
  align-items: flex-end;
  padding: 1.4rem;
}

.efx-animated-grid-bg__grid {
  position: absolute;
  inset: -30px;
  background-image:
    linear-gradient(rgba(13, 148, 136, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(13, 148, 136, 0.16) 1px, transparent 1px);
  background-size: 30px 30px;
  animation: efx-animated-grid-bg-pan 1.4s linear infinite;
  -webkit-mask-image: radial-gradient(ellipse 90% 85% at 50% 45%, #000 35%, transparent 78%);
  mask-image: radial-gradient(ellipse 90% 85% at 50% 45%, #000 35%, transparent 78%);
}

.efx-animated-grid-bg__pin {
  position: absolute;
  top: 32%;
  left: 62%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f43f5e;
  border: 2.5px solid #ffffff;
  box-shadow: 0 2px 8px rgba(244, 63, 94, 0.5);
}

.efx-animated-grid-bg__pin::after {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid rgba(244, 63, 94, 0.6);
  animation: efx-animated-grid-bg-ping 1.8s cubic-bezier(0, 0.2, 0.4, 1) infinite;
}

.efx-animated-grid-bg__content {
  position: relative;
}

.efx-animated-grid-bg__kicker {
  display: block;
  margin-bottom: 0.35rem;
  color: #0d9488;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.efx-animated-grid-bg__title {
  margin: 0;
  color: #134e4a;
  font-size: 1.35rem;
  font-weight: 800;
}

@keyframes efx-animated-grid-bg-pan {
  from { background-position: 0 0, 0 0; }
  to { background-position: 30px 30px, 30px 30px; }
}

@keyframes efx-animated-grid-bg-ping {
  0% { transform: scale(1); opacity: 0.9; }
  70%, 100% { transform: scale(3); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .efx-animated-grid-bg__grid,
  .efx-animated-grid-bg__pin::after {
    animation: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-animated-grid-bg">
  <div class="efx-animated-grid-bg__grid" aria-hidden="true"></div>
  <span class="efx-animated-grid-bg__pin" aria-hidden="true"></span>
  <div class="efx-animated-grid-bg__content">
    <span class="efx-animated-grid-bg__kicker">Venue Map</span>
    <h4 class="efx-animated-grid-bg__title">Interactive Floor Plan</h4>
  </div>
</div>
`,
  },

  {
    id: 'gradient-mesh-bg',
    name: 'Gradient Mesh Background',
    category: 'backgrounds',
    description:
      'A soft multi-point color mesh — emerald, amber, rose and teal — that drifts almost imperceptibly behind your content. The trendy "mesh gradient" hero banner in pure CSS.',
    difficulty: 'intermediate',
    tags: ['mesh', 'gradient', 'radial', 'hero'],
    demoKind: 'static',
    cssCode: `
.efx-gradient-mesh-bg {
  position: relative;
  overflow: hidden;
  min-height: 200px;
  border-radius: 18px;
  padding: 1.6rem;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background:
    radial-gradient(farthest-corner at 18% 22%, rgba(16, 185, 129, 0.55), transparent 60%),
    radial-gradient(farthest-corner at 82% 18%, rgba(245, 158, 11, 0.5), transparent 55%),
    radial-gradient(farthest-corner at 78% 82%, rgba(244, 63, 94, 0.42), transparent 55%),
    radial-gradient(farthest-corner at 22% 88%, rgba(20, 184, 166, 0.5), transparent 60%),
    linear-gradient(160deg, #ecfdf5, #f8fafc);
  background-repeat: no-repeat;
  background-size: 180% 180%, 160% 160%, 170% 170%, 190% 190%, 100% 100%;
  animation: efx-gradient-mesh-bg-drift 14s ease-in-out infinite alternate;
}

.efx-gradient-mesh-bg__badge {
  align-self: flex-start;
  margin-bottom: 0.7rem;
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  color: #0f766e;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.efx-gradient-mesh-bg__title {
  margin: 0 0 0.3rem;
  color: #0f172a;
  font-size: 1.55rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.efx-gradient-mesh-bg__meta {
  margin: 0;
  color: #334155;
  font-size: 0.9rem;
}

@keyframes efx-gradient-mesh-bg-drift {
  from {
    background-position: 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0 0;
  }
  to {
    background-position: 18% 14%, 82% 14%, 82% 86%, 18% 86%, 0 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .efx-gradient-mesh-bg {
    animation: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-gradient-mesh-bg">
  <span class="efx-gradient-mesh-bg__badge">Just announced</span>
  <h4 class="efx-gradient-mesh-bg__title">New Year Splash Party</h4>
  <p class="efx-gradient-mesh-bg__meta">Dec 31 · Oasis Rooftop, Cantonments · Champagne at midnight</p>
</div>
`,
  },

  {
    id: 'floating-orbs-bg',
    name: 'Floating Orbs Background',
    category: 'backgrounds',
    description:
      'Glossy soft-shadow orbs of emerald, amber and rose bob gently around the stage like balloons over a chill zone. Depth comes from radial gradients and layered shadows.',
    difficulty: 'intermediate',
    tags: ['orbs', 'float', 'ambient', 'soft-ui'],
    demoKind: 'static',
    cssCode: `
.efx-floating-orbs-bg {
  position: relative;
  overflow: hidden;
  min-height: 205px;
  border-radius: 18px;
  padding: 1.6rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.efx-floating-orbs-bg__orb {
  position: absolute;
  border-radius: 50%;
  animation: efx-floating-orbs-bg-float 8s ease-in-out infinite alternate;
}

.efx-floating-orbs-bg__orb--emerald {
  width: 110px;
  height: 110px;
  left: 8%;
  top: 18%;
  background: radial-gradient(circle at 32% 30%, #6ee7b7, #10b981 68%);
  box-shadow: 0 18px 40px -12px rgba(16, 185, 129, 0.55);
}

.efx-floating-orbs-bg__orb--amber {
  width: 84px;
  height: 84px;
  right: 14%;
  top: 12%;
  background: radial-gradient(circle at 35% 30%, #fcd34d, #f59e0b 70%);
  box-shadow: 0 16px 34px -10px rgba(245, 158, 11, 0.5);
  animation-duration: 6.5s;
  animation-delay: -1.2s;
}

.efx-floating-orbs-bg__orb--rose {
  width: 64px;
  height: 64px;
  left: 46%;
  bottom: 10%;
  background: radial-gradient(circle at 34% 30%, #fda4af, #f43f5e 70%);
  box-shadow: 0 14px 30px -10px rgba(244, 63, 94, 0.45);
  animation-duration: 7.2s;
  animation-delay: -2.6s;
}

.efx-floating-orbs-bg__content {
  position: relative;
  text-align: center;
}

.efx-floating-orbs-bg__title {
  margin: 0 0 0.3rem;
  color: #0f172a;
  font-size: 1.5rem;
  font-weight: 800;
}

.efx-floating-orbs-bg__meta {
  margin: 0 auto;
  max-width: 24ch;
  color: #475569;
  font-size: 0.9rem;
  line-height: 1.55;
}

@keyframes efx-floating-orbs-bg-float {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(14px, -22px, 0) scale(1.08); }
}

@media (prefers-reduced-motion: reduce) {
  .efx-floating-orbs-bg__orb {
    animation: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-floating-orbs-bg">
  <span class="efx-floating-orbs-bg__orb efx-floating-orbs-bg__orb--emerald" aria-hidden="true"></span>
  <span class="efx-floating-orbs-bg__orb efx-floating-orbs-bg__orb--amber" aria-hidden="true"></span>
  <span class="efx-floating-orbs-bg__orb efx-floating-orbs-bg__orb--rose" aria-hidden="true"></span>
  <div class="efx-floating-orbs-bg__content">
    <h4 class="efx-floating-orbs-bg__title">The Chill Zone</h4>
    <p class="efx-floating-orbs-bg__meta">Hammocks, smoothies and slow jams — all day, every day.</p>
  </div>
</div>
`,
  },

  /* ------------------------------------------------------------------ *
   * HOVER
   * ------------------------------------------------------------------ */

  {
    id: 'zoom-reveal-image',
    name: 'Zoom Reveal Image',
    category: 'hover',
    description:
      'An event cover that zooms to 114% on hover while its title slides up on a dark gradient scrim. The signature hover of every modern media grid.',
    difficulty: 'beginner',
    tags: ['zoom', 'caption', 'reveal', 'media'],
    demoKind: 'interactive',
    cssCode: `
.efx-zoom-reveal-image {
  position: relative;
  overflow: hidden;
  max-width: 340px;
  margin: 1.25rem auto;
  border-radius: 18px;
  aspect-ratio: 16 / 10;
  cursor: pointer;
  box-shadow: 0 18px 36px -16px rgba(15, 23, 42, 0.35);
}

.efx-zoom-reveal-image__media {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 78% 22%, rgba(253, 224, 71, 0.5), transparent 50%),
    radial-gradient(circle at 20% 82%, rgba(244, 63, 94, 0.35), transparent 55%),
    linear-gradient(160deg, #064e3b 0%, #0f766e 45%, #134e4a 100%);
  transition: transform 0.85s cubic-bezier(0.22, 0.9, 0.3, 1);
}

.efx-zoom-reveal-image__caption {
  position: absolute;
  inset: auto 0 0 0;
  padding: 2.4rem 1.3rem 1.15rem;
  background: linear-gradient(180deg, transparent, rgba(2, 20, 15, 0.88));
  transform: translateY(102%);
  transition: transform 0.5s cubic-bezier(0.22, 0.9, 0.3, 1);
}

.efx-zoom-reveal-image__title {
  display: block;
  color: #ffffff;
  font-weight: 800;
  font-size: 1.15rem;
}

.efx-zoom-reveal-image__meta {
  display: block;
  margin-top: 0.2rem;
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.85rem;
}

.efx-zoom-reveal-image:hover .efx-zoom-reveal-image__media {
  transform: scale(1.14);
}

.efx-zoom-reveal-image:hover .efx-zoom-reveal-image__caption {
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .efx-zoom-reveal-image__media,
  .efx-zoom-reveal-image__caption {
    transition: none;
  }
  .efx-zoom-reveal-image:hover .efx-zoom-reveal-image__media {
    transform: none;
  }
}
`,
    htmlSnippet: `
<figure class="efx-zoom-reveal-image">
  <div class="efx-zoom-reveal-image__media" aria-hidden="true"></div>
  <figcaption class="efx-zoom-reveal-image__caption">
    <span class="efx-zoom-reveal-image__title">Accra Gospel Night</span>
    <span class="efx-zoom-reveal-image__meta">Dec 14 · Independence Square</span>
  </figcaption>
</figure>
`,
  },

  {
    id: 'ken-burns-image',
    name: 'Ken Burns Image',
    category: 'hover',
    description:
      'A cinematic slow pan-and-zoom that breathes life into static event covers. The golden-hour palette sells warmth before a single word is read.',
    difficulty: 'beginner',
    tags: ['ken-burns', 'pan', 'cinematic', 'zoom'],
    demoKind: 'static',
    cssCode: `
.efx-ken-burns-image {
  position: relative;
  overflow: hidden;
  max-width: 340px;
  margin: 1.25rem auto;
  border-radius: 18px;
  aspect-ratio: 16 / 10;
}

.efx-ken-burns-image__media {
  position: absolute;
  inset: -8%;
  background:
    radial-gradient(circle at 30% 25%, rgba(253, 230, 138, 0.55), transparent 45%),
    linear-gradient(200deg, #7c2d12 0%, #b45309 38%, #f59e0b 70%, #fde68a 100%);
  animation: efx-ken-burns-image-zoom 14s ease-in-out infinite alternate;
}

.efx-ken-burns-image__tag {
  position: absolute;
  top: 14px;
  left: 14px;
  padding: 0.32rem 0.8rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #92400e;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.efx-ken-burns-image__caption {
  position: absolute;
  left: 16px;
  bottom: 14px;
  color: #ffffff;
  font-weight: 800;
  font-size: 1.05rem;
  text-shadow: 0 2px 10px rgba(69, 26, 3, 0.55);
}

@keyframes efx-ken-burns-image-zoom {
  from { transform: scale(1) translate(0, 0); }
  to { transform: scale(1.22) translate(-3.5%, -4%); }
}

@media (prefers-reduced-motion: reduce) {
  .efx-ken-burns-image__media {
    animation: none;
  }
}
`,
    htmlSnippet: `
<figure class="efx-ken-burns-image">
  <div class="efx-ken-burns-image__media" aria-hidden="true"></div>
  <span class="efx-ken-burns-image__tag">Photo Diary · 128 shots</span>
  <figcaption class="efx-ken-burns-image__caption">Safari Sunset Session</figcaption>
</figure>
`,
  },

  {
    id: 'duotone-hover-image',
    name: 'Duotone Hover Image',
    category: 'hover',
    description:
      'Event art rendered in a moody teal duotone — grayscale plus a blend-mode tint — that melts into full color on hover. The tint layer adds a subtle zoom for extra depth.',
    difficulty: 'intermediate',
    tags: ['duotone', 'grayscale', 'blend', 'tint'],
    demoKind: 'interactive',
    cssCode: `
.efx-duotone-hover-image {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  max-width: 340px;
  margin: 1.25rem auto;
  border-radius: 18px;
  aspect-ratio: 16 / 10;
  cursor: pointer;
}

.efx-duotone-hover-image__media {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 70% 30%, rgba(255, 255, 255, 0.35), transparent 50%),
    radial-gradient(circle at 25% 85%, rgba(244, 63, 94, 0.4), transparent 55%),
    linear-gradient(150deg, #1f2937 0%, #0f766e 55%, #134e4a 100%);
  filter: grayscale(1) contrast(1.1) brightness(0.95);
  transition: filter 0.55s ease, transform 0.55s ease;
}

.efx-duotone-hover-image__tint {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    150deg,
    rgba(13, 148, 136, 0.85),
    rgba(6, 78, 59, 0.7) 60%,
    rgba(245, 158, 11, 0.35)
  );
  mix-blend-mode: color;
  transition: opacity 0.55s ease;
}

.efx-duotone-hover-image__caption {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 1.9rem 1.2rem 1.05rem;
  background: linear-gradient(180deg, transparent, rgba(8, 34, 30, 0.85));
}

.efx-duotone-hover-image__title {
  display: block;
  color: #ffffff;
  font-weight: 800;
  font-size: 1.05rem;
}

.efx-duotone-hover-image__hint {
  display: block;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.efx-duotone-hover-image:hover .efx-duotone-hover-image__tint {
  opacity: 0;
}

.efx-duotone-hover-image:hover .efx-duotone-hover-image__media {
  filter: grayscale(0) contrast(1.03);
  transform: scale(1.05);
}

@media (prefers-reduced-motion: reduce) {
  .efx-duotone-hover-image__media,
  .efx-duotone-hover-image__tint {
    transition: none;
  }
  .efx-duotone-hover-image:hover .efx-duotone-hover-image__media {
    transform: none;
  }
}
`,
    htmlSnippet: `
<figure class="efx-duotone-hover-image">
  <div class="efx-duotone-hover-image__media" aria-hidden="true"></div>
  <div class="efx-duotone-hover-image__tint" aria-hidden="true"></div>
  <figcaption class="efx-duotone-hover-image__caption">
    <span class="efx-duotone-hover-image__title">Chale Wote Street Carnival</span>
    <span class="efx-duotone-hover-image__hint">Hover for full colour</span>
  </figcaption>
</figure>
`,
  },

  {
    id: 'underline-slide-link',
    name: 'Underline Slide Link',
    category: 'hover',
    description:
      'A directional underline that slides in from the left on hover and exits to the right — never retracing its path. Small detail, enormous polish.',
    difficulty: 'beginner',
    tags: ['underline', 'slide', 'directional', 'link'],
    demoKind: 'interactive',
    cssCode: `
.efx-underline-slide-link-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.5rem;
}

.efx-underline-slide-link {
  position: relative;
  display: inline-block;
  padding-bottom: 6px;
  color: #0f172a;
  font-weight: 700;
  font-size: 1.05rem;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.3s ease;
}

.efx-underline-slide-link::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2.5px;
  border-radius: 2px;
  background: linear-gradient(90deg, #10b981, #f59e0b);
  transform: scaleX(0);
  transform-origin: right center;
  transition: transform 0.4s cubic-bezier(0.3, 0.7, 0.3, 1);
}

.efx-underline-slide-link:hover {
  color: #047857;
}

.efx-underline-slide-link:hover::after {
  transform: scaleX(1);
  transform-origin: left center;
}

.efx-underline-slide-link:focus-visible {
  outline: 2px solid rgba(16, 185, 129, 0.5);
  outline-offset: 4px;
  border-radius: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .efx-underline-slide-link,
  .efx-underline-slide-link::after {
    transition: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-underline-slide-link-group">
  <a class="efx-underline-slide-link" href="#december">December line-up</a>
  <a class="efx-underline-slide-link" href="#gospel">Gospel series</a>
  <a class="efx-underline-slide-link" href="#beach">Beach events</a>
</div>
`,
  },

  /* ------------------------------------------------------------------ *
   * INPUTS
   * ------------------------------------------------------------------ */

  {
    id: 'floating-label-input',
    name: 'Floating Label Input',
    category: 'inputs',
    description:
      'A booking form field whose label glides up into caption position on focus — or once content exists — powered purely by :focus and :placeholder-shown. Includes a soft focus ring.',
    difficulty: 'intermediate',
    tags: ['floating', 'label', 'form', 'material'],
    demoKind: 'interactive',
    cssCode: `
.efx-floating-label-input {
  position: relative;
  max-width: 340px;
  margin: 1.75rem auto;
}

.efx-floating-label-input__field {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: 1.05rem 1rem 0.65rem;
  border: 1.5px solid #cbd5e1;
  border-radius: 12px;
  background: #ffffff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 0.98rem;
  color: #0f172a;
  outline: none;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.efx-floating-label-input__field:focus {
  border-color: #10b981;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.18);
}

.efx-floating-label-input__label {
  position: absolute;
  left: 1rem;
  top: 0.92rem;
  color: #94a3b8;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 0.95rem;
  pointer-events: none;
  transform-origin: left top;
  transition: transform 0.22s cubic-bezier(0.3, 0.7, 0.3, 1), color 0.22s ease;
}

.efx-floating-label-input__field:focus + .efx-floating-label-input__label,
.efx-floating-label-input__field:not(:placeholder-shown) + .efx-floating-label-input__label {
  transform: translateY(-0.62rem) scale(0.74);
  color: #047857;
}

@media (prefers-reduced-motion: reduce) {
  .efx-floating-label-input__field,
  .efx-floating-label-input__label {
    transition: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-floating-label-input">
  <input class="efx-floating-label-input__field" id="efx-floating-label-email" type="email" placeholder=" " />
  <label class="efx-floating-label-input__label" for="efx-floating-label-email">Email address</label>
</div>
`,
  },

  {
    id: 'glow-focus-input',
    name: 'Glow Focus Input',
    category: 'inputs',
    description:
      'A search field that ignites on focus: an amber halo ring blooms via :focus-within while the magnifier icon warms up and scales. Accessible and inviting.',
    difficulty: 'beginner',
    tags: ['focus', 'glow', 'ring', 'search'],
    demoKind: 'interactive',
    cssCode: `
.efx-glow-focus-input {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  max-width: 360px;
  margin: 1.75rem auto;
  padding: 0.15rem 1rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  background: #ffffff;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.efx-glow-focus-input:focus-within {
  border-color: #f59e0b;
  box-shadow:
    0 0 0 4px rgba(245, 158, 11, 0.22),
    0 10px 26px -12px rgba(245, 158, 11, 0.55);
}

.efx-glow-focus-input__icon {
  width: 19px;
  height: 19px;
  flex: none;
  color: #94a3b8;
  transition: color 0.25s ease, transform 0.25s ease;
}

.efx-glow-focus-input:focus-within .efx-glow-focus-input__icon {
  color: #d97706;
  transform: scale(1.1);
}

.efx-glow-focus-input__field {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  padding: 0.85rem 0;
  background: transparent;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 0.97rem;
  color: #0f172a;
}

.efx-glow-focus-input__field::placeholder {
  color: #94a3b8;
}

@media (prefers-reduced-motion: reduce) {
  .efx-glow-focus-input,
  .efx-glow-focus-input__icon {
    transition: none;
  }
}
`,
    htmlSnippet: `
<div class="efx-glow-focus-input">
  <svg class="efx-glow-focus-input__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
  <input class="efx-glow-focus-input__field" type="text" placeholder="Search events, artists, venues…" />
</div>
`,
  },

  {
    id: 'search-expand-input',
    name: 'Search Expand Input',
    category: 'inputs',
    description:
      'A collapsed search pill that stretches open on focus to reveal its input, with a springy width transition. Clicking anywhere on the pill opens it — pure label semantics, zero JavaScript.',
    difficulty: 'intermediate',
    tags: ['expand', 'search', 'focus', 'compact'],
    demoKind: 'interactive',
    cssCode: `
.efx-search-expand-input {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin: 1.5rem 0;
  padding: 0.45rem 1.05rem 0.45rem 0.5rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 999px;
  background: #ffffff;
  cursor: text;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

.efx-search-expand-input:focus-within {
  border-color: #14b8a6;
  box-shadow:
    0 0 0 4px rgba(20, 184, 166, 0.16),
    0 12px 24px -12px rgba(20, 184, 166, 0.45);
}

.efx-search-expand-input__icon-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(150deg, #2dd4bf, #0d9488);
  color: #ffffff;
  flex: none;
}

.efx-search-expand-input__icon {
  width: 17px;
  height: 17px;
}

.efx-search-expand-input__field {
  width: 0;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 0.95rem;
  color: #0f172a;
  opacity: 0;
  transition:
    width 0.45s cubic-bezier(0.25, 0.8, 0.25, 1),
    padding 0.45s cubic-bezier(0.25, 0.8, 0.25, 1),
    opacity 0.3s ease;
}

.efx-search-expand-input__field::placeholder {
  color: #94a3b8;
}

.efx-search-expand-input:focus-within .efx-search-expand-input__field {
  width: 170px;
  padding: 0.35rem 0.25rem;
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .efx-search-expand-input,
  .efx-search-expand-input__field {
    transition: none;
  }
}
`,
    htmlSnippet: `
<label class="efx-search-expand-input">
  <span class="efx-search-expand-input__icon-circle" aria-hidden="true">
    <svg class="efx-search-expand-input__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
  </span>
  <input class="efx-search-expand-input__field" type="text" placeholder="Find your vibe…" />
</label>
`,
  },

  /* ------------------------------------------------------------------ *
   * TOGGLES
   * ------------------------------------------------------------------ */

  {
    id: 'ios-toggle-switch',
    name: 'iOS Toggle Switch',
    category: 'toggles',
    description:
      'A faithful iOS-style switch with a sliding knob, inset track shading and a focus-visible ring for keyboard users. Flips to brand emerald when on.',
    difficulty: 'intermediate',
    tags: ['ios', 'switch', 'toggle', 'knob'],
    demoKind: 'interactive',
    cssCode: `
.efx-ios-toggle-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  margin: 1.25rem 0;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.efx-ios-toggle-switch__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.efx-ios-toggle-switch__track {
  position: relative;
  width: 52px;
  height: 30px;
  border-radius: 999px;
  background: #e2e8f0;
  box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.18);
  transition: background 0.32s cubic-bezier(0.3, 0.7, 0.3, 1);
  flex: none;
}

.efx-ios-toggle-switch__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(180deg, #ffffff, #f1f5f9);
  box-shadow: 0 2px 5px rgba(15, 23, 42, 0.35);
  transition: transform 0.32s cubic-bezier(0.3, 0.7, 0.3, 1), box-shadow 0.32s ease;
}

.efx-ios-toggle-switch__input:checked ~ .efx-ios-toggle-switch__track {
  background: linear-gradient(90deg, #34d399, #10b981);
}

.efx-ios-toggle-switch__input:checked ~ .efx-ios-toggle-switch__track .efx-ios-toggle-switch__knob {
  transform: translateX(22px);
  box-shadow: 0 2px 6px rgba(5, 150, 105, 0.45), 0 0 0 8px rgba(16, 185, 129, 0.18);
}

.efx-ios-toggle-switch__input:focus-visible ~ .efx-ios-toggle-switch__track {
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.4), inset 0 1px 3px rgba(15, 23, 42, 0.18);
}

.efx-ios-toggle-switch__text {
  color: #334155;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
}

@media (prefers-reduced-motion: reduce) {
  .efx-ios-toggle-switch__track,
  .efx-ios-toggle-switch__knob {
    transition: none;
  }
}
`,
    htmlSnippet: `
<label class="efx-ios-toggle-switch">
  <input class="efx-ios-toggle-switch__input" type="checkbox" />
  <span class="efx-ios-toggle-switch__track"><span class="efx-ios-toggle-switch__knob" aria-hidden="true"></span></span>
  <span class="efx-ios-toggle-switch__text">Remind me before doors open</span>
</label>
`,
  },

  {
    id: 'heart-burst-toggle',
    name: 'Heart Burst Toggle',
    category: 'toggles',
    description:
      'A like button that pops the heart with a spring curve while particle dots and a shockwave ring burst outward on check. Every layer is CSS; the state is a checkbox.',
    difficulty: 'advanced',
    tags: ['heart', 'burst', 'particles', 'like'],
    demoKind: 'interactive',
    cssCode: `
.efx-heart-burst-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  margin: 1.25rem 0;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.efx-heart-burst-toggle__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.efx-heart-burst-toggle__stack {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  transition: background 0.3s ease, border-color 0.3s ease;
  flex: none;
}

.efx-heart-burst-toggle__heart {
  position: relative;
  z-index: 1;
  width: 22px;
  height: 22px;
  fill: none;
  stroke: #fb7185;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: fill 0.25s ease, stroke 0.25s ease;
}

.efx-heart-burst-toggle__input:checked ~ .efx-heart-burst-toggle__stack {
  background: #ffe4e6;
  border-color: #fda4af;
}

.efx-heart-burst-toggle__input:checked ~ .efx-heart-burst-toggle__stack .efx-heart-burst-toggle__heart {
  fill: #f43f5e;
  stroke: #f43f5e;
  animation: efx-heart-burst-toggle-pop 0.55s cubic-bezier(0.3, 1.6, 0.5, 1);
}

.efx-heart-burst-toggle__burst {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  background:
    radial-gradient(circle 2.5px at 50% 0%, #f43f5e 98%, transparent),
    radial-gradient(circle 2.5px at 86% 25%, #fb7185 98%, transparent),
    radial-gradient(circle 2.5px at 100% 68%, #f59e0b 98%, transparent),
    radial-gradient(circle 2.5px at 72% 100%, #f43f5e 98%, transparent),
    radial-gradient(circle 2.5px at 28% 100%, #fb7185 98%, transparent),
    radial-gradient(circle 2.5px at 0% 68%, #f59e0b 98%, transparent),
    radial-gradient(circle 2.5px at 14% 25%, #f43f5e 98%, transparent);
}

.efx-heart-burst-toggle__ring {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  border: 2px solid rgba(244, 63, 94, 0.7);
  opacity: 0;
  pointer-events: none;
}

.efx-heart-burst-toggle__input:checked ~ .efx-heart-burst-toggle__stack .efx-heart-burst-toggle__burst {
  animation: efx-heart-burst-toggle-fly 0.65s cubic-bezier(0.2, 0.7, 0.3, 1) 0.05s;
}

.efx-heart-burst-toggle__input:checked ~ .efx-heart-burst-toggle__stack .efx-heart-burst-toggle__ring {
  animation: efx-heart-burst-toggle-ring 0.55s ease-out 0.05s;
}

.efx-heart-burst-toggle__text {
  position: relative;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-weight: 700;
  font-size: 0.95rem;
  color: #334155;
}

.efx-heart-burst-toggle__text--active {
  display: none;
  color: #e11d48;
}

.efx-heart-burst-toggle__input:checked ~ .efx-heart-burst-toggle__text .efx-heart-burst-toggle__text--idle {
  display: none;
}

.efx-heart-burst-toggle__input:checked ~ .efx-heart-burst-toggle__text .efx-heart-burst-toggle__text--active {
  display: inline;
}

@keyframes efx-heart-burst-toggle-pop {
  0% { transform: scale(0.65); }
  45% { transform: scale(1.32); }
  75% { transform: scale(0.92); }
  100% { transform: scale(1); }
}

@keyframes efx-heart-burst-toggle-fly {
  0% { opacity: 1; transform: scale(0.25); }
  70% { opacity: 0.9; }
  100% { opacity: 0; transform: scale(1.9); }
}

@keyframes efx-heart-burst-toggle-ring {
  0% { opacity: 0.9; transform: scale(0.5); }
  100% { opacity: 0; transform: scale(1.5); }
}

@media (prefers-reduced-motion: reduce) {
  .efx-heart-burst-toggle__heart,
  .efx-heart-burst-toggle__burst,
  .efx-heart-burst-toggle__ring {
    animation: none !important;
  }
}
`,
    htmlSnippet: `
<label class="efx-heart-burst-toggle">
  <input class="efx-heart-burst-toggle__input" type="checkbox" />
  <span class="efx-heart-burst-toggle__stack">
    <span class="efx-heart-burst-toggle__burst" aria-hidden="true"></span>
    <span class="efx-heart-burst-toggle__ring" aria-hidden="true"></span>
    <svg class="efx-heart-burst-toggle__heart" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  </span>
  <span class="efx-heart-burst-toggle__text">
    <span class="efx-heart-burst-toggle__text--idle">Count me in</span>
    <span class="efx-heart-burst-toggle__text--active">You're on the list</span>
  </span>
</label>
`,
  },

  /* ------------------------------------------------------------------ *
   * NAVIGATION
   * ------------------------------------------------------------------ */

  {
    id: 'underline-slide-nav',
    name: 'Underline Slide Nav',
    category: 'navigation',
    description:
      'A primary nav where each link grows a centered teal underline on hover, while the active route keeps a permanent amber marker. Center-out motion feels decisive.',
    difficulty: 'beginner',
    tags: ['nav', 'underline', 'center-out', 'active'],
    demoKind: 'interactive',
    cssCode: `
.efx-underline-slide-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.2rem;
  max-width: 380px;
  margin: 1.5rem auto;
  padding: 0.6rem 0.4rem;
  border-bottom: 1px solid #e2e8f0;
}

.efx-underline-slide-nav__link {
  position: relative;
  padding: 0.35rem 0.1rem;
  color: #475569;
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.3s ease;
}

.efx-underline-slide-nav__link::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -3px;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: linear-gradient(90deg, #0d9488, #2dd4bf);
  transform: scaleX(0);
  transition: transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.efx-underline-slide-nav__link:hover {
  color: #0f766e;
}

.efx-underline-slide-nav__link:hover::after {
  transform: scaleX(1);
}

.efx-underline-slide-nav__link--active {
  color: #b45309;
}

.efx-underline-slide-nav__link--active::after {
  transform: scaleX(1);
  background: linear-gradient(90deg, #f59e0b, #fbbf24);
}

.efx-underline-slide-nav__link:focus-visible {
  outline: 2px solid rgba(13, 148, 136, 0.5);
  outline-offset: 3px;
  border-radius: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .efx-underline-slide-nav__link,
  .efx-underline-slide-nav__link::after {
    transition: none;
  }
}
`,
    htmlSnippet: `
<nav class="efx-underline-slide-nav" aria-label="Primary">
  <a class="efx-underline-slide-nav__link efx-underline-slide-nav__link--active" href="#events">Events</a>
  <a class="efx-underline-slide-nav__link" href="#artists">Artists</a>
  <a class="efx-underline-slide-nav__link" href="#venues">Venues</a>
  <a class="efx-underline-slide-nav__link" href="#help">Help</a>
</nav>
`,
  },

  {
    id: 'pill-nav',
    name: 'Sliding Pill Nav',
    category: 'navigation',
    description:
      'A segmented control whose white indicator pill glides between All / Live / Past tabs with a springy overshoot. Hidden radio inputs drive it — no JavaScript, fully keyboard accessible.',
    difficulty: 'advanced',
    tags: ['pill', 'radio', 'segmented', 'indicator'],
    demoKind: 'interactive',
    cssCode: `
.efx-pill-nav {
  position: relative;
  display: flex;
  max-width: 360px;
  margin: 1.5rem auto;
  padding: 5px;
  border-radius: 999px;
  background: #eef2f7;
  border: 1px solid #e2e8f0;
}

.efx-pill-nav__radio {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.efx-pill-nav__indicator {
  position: absolute;
  top: 5px;
  bottom: 5px;
  left: 5px;
  width: calc((100% - 10px) / 3);
  border-radius: 999px;
  background: #ffffff;
  box-shadow:
    0 4px 12px -2px rgba(15, 23, 42, 0.18),
    0 0 0 1px rgba(15, 23, 42, 0.04);
  transition: transform 0.4s cubic-bezier(0.34, 1.3, 0.4, 1);
  z-index: 0;
}

.efx-pill-nav__radio:nth-of-type(1):checked ~ .efx-pill-nav__indicator {
  transform: translateX(0);
}

.efx-pill-nav__radio:nth-of-type(2):checked ~ .efx-pill-nav__indicator {
  transform: translateX(100%);
}

.efx-pill-nav__radio:nth-of-type(3):checked ~ .efx-pill-nav__indicator {
  transform: translateX(200%);
}

.efx-pill-nav__tab {
  position: relative;
  z-index: 1;
  flex: 1;
  text-align: center;
  padding: 0.6rem 0.5rem;
  border-radius: 999px;
  color: #64748b;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: color 0.3s ease;
}

.efx-pill-nav__radio:nth-of-type(1):checked ~ .efx-pill-nav__tab:nth-of-type(1) {
  color: #0f766e;
}

.efx-pill-nav__radio:nth-of-type(2):checked ~ .efx-pill-nav__tab:nth-of-type(2) {
  color: #e11d48;
}

.efx-pill-nav__radio:nth-of-type(3):checked ~ .efx-pill-nav__tab:nth-of-type(3) {
  color: #b45309;
}

.efx-pill-nav__radio:focus-visible ~ .efx-pill-nav__indicator {
  box-shadow:
    0 4px 12px -2px rgba(15, 23, 42, 0.18),
    0 0 0 2px rgba(13, 148, 136, 0.55);
}

@media (prefers-reduced-motion: reduce) {
  .efx-pill-nav__indicator {
    transition: none;
  }
}
`,
    htmlSnippet: `
<nav class="efx-pill-nav" aria-label="Event filters">
  <input class="efx-pill-nav__radio" type="radio" name="efx-pill-nav-demo" id="efx-pill-nav-all" checked />
  <input class="efx-pill-nav__radio" type="radio" name="efx-pill-nav-demo" id="efx-pill-nav-live" />
  <input class="efx-pill-nav__radio" type="radio" name="efx-pill-nav-demo" id="efx-pill-nav-past" />
  <span class="efx-pill-nav__indicator" aria-hidden="true"></span>
  <label class="efx-pill-nav__tab" for="efx-pill-nav-all">All Events</label>
  <label class="efx-pill-nav__tab" for="efx-pill-nav-live">Live Now</label>
  <label class="efx-pill-nav__tab" for="efx-pill-nav-past">Past</label>
</nav>
`,
  },

  /* ------------------------------------------------------------------ *
   * FEEDBACK
   * ------------------------------------------------------------------ */

  {
    id: 'badge-ping',
    name: 'Badge Ping',
    category: 'feedback',
    description:
      'A notification bell whose rose dot emits an endless expanding ping ring, guaranteeing the eye lands on unread updates. Hovering lifts the bell tile softly.',
    difficulty: 'beginner',
    tags: ['badge', 'ping', 'notification', 'dot'],
    demoKind: 'static',
    cssCode: `
.efx-badge-ping {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border: none;
  border-radius: 14px;
  background: #f0fdfa;
  color: #0f766e;
  cursor: pointer;
  transition: background 0.3s ease, transform 0.25s ease;
}

.efx-badge-ping:hover {
  background: #ccfbf1;
  transform: translateY(-2px);
}

.efx-badge-ping:focus-visible {
  outline: 3px solid rgba(15, 118, 110, 0.35);
  outline-offset: 3px;
}

.efx-badge-ping__icon {
  width: 24px;
  height: 24px;
}

.efx-badge-ping__ping {
  position: absolute;
  top: 11px;
  right: 11px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(244, 63, 94, 0.6);
  animation: efx-badge-ping-ring 1.8s cubic-bezier(0, 0.35, 0.5, 1) infinite;
}

.efx-badge-ping__dot {
  position: absolute;
  top: 11px;
  right: 11px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f43f5e;
  box-shadow: 0 0 0 2px #f0fdfa;
}

@keyframes efx-badge-ping-ring {
  0% { transform: scale(1); opacity: 0.85; }
  75%, 100% { transform: scale(2.9); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .efx-badge-ping__ping {
    animation: none;
    opacity: 0;
  }
  .efx-badge-ping {
    transition: none;
  }
  .efx-badge-ping:hover {
    transform: none;
  }
}
`,
    htmlSnippet: `
<button class="efx-badge-ping" type="button" aria-label="3 unread notifications">
  <svg class="efx-badge-ping__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
  <span class="efx-badge-ping__ping" aria-hidden="true"></span>
  <span class="efx-badge-ping__dot" aria-hidden="true"></span>
</button>
`,
  },

  {
    id: 'toast-slide-in',
    name: 'Toast Slide-In',
    category: 'feedback',
    description:
      'A success toast that drops into a reserved notification region, holds for reading, then lifts away — an infinite demo loop with production-ready easing.',
    difficulty: 'intermediate',
    tags: ['toast', 'slide', 'notification', 'loop'],
    demoKind: 'static',
    cssCode: `
.efx-toast-slide-in {
  position: relative;
  overflow: hidden;
  max-width: 360px;
  margin: 1.5rem auto;
  min-height: 96px;
}

.efx-toast-slide-in__slot {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
  color: #94a3b8;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.efx-toast-slide-in__toast {
  position: absolute;
  inset: 0 0 auto 0;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.95rem 1.1rem;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid #a7f3d0;
  box-shadow: 0 22px 40px -18px rgba(5, 150, 105, 0.45);
  animation: efx-toast-slide-in-cycle 4.5s cubic-bezier(0.3, 0.9, 0.3, 1) infinite;
}

.efx-toast-slide-in__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(180deg, #34d399, #059669);
  flex: none;
}

.efx-toast-slide-in__icon svg {
  width: 18px;
  height: 18px;
}

.efx-toast-slide-in__title {
  display: block;
  color: #064e3b;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 0.95rem;
  font-weight: 800;
}

.efx-toast-slide-in__meta {
  display: block;
  margin-top: 0.1rem;
  color: #64748b;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 0.83rem;
}

@keyframes efx-toast-slide-in-cycle {
  0% { transform: translateY(-130%); opacity: 0; }
  14% { transform: translateY(0); opacity: 1; }
  80% { transform: translateY(0); opacity: 1; }
  94%, 100% { transform: translateY(-130%); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .efx-toast-slide-in__toast {
    animation: none;
    transform: none;
    opacity: 1;
  }
}
`,
    htmlSnippet: `
<div class="efx-toast-slide-in">
  <div class="efx-toast-slide-in__slot" aria-hidden="true">notification region</div>
  <div class="efx-toast-slide-in__toast" role="status">
    <span class="efx-toast-slide-in__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
    </span>
    <span>
      <strong class="efx-toast-slide-in__title">Tickets secured!</strong>
      <span class="efx-toast-slide-in__meta">2 × VIP · Accra Gospel Night</span>
    </span>
  </div>
</div>
`,
  },

  {
    id: 'copy-success-checkmark',
    name: 'Copy Success Checkmark',
    category: 'feedback',
    description:
      'A copy button whose checkmark draws itself with an animated stroke-dashoffset when toggled, while the label crossfades to "Copied!". A satisfying, repeatable micro-interaction.',
    difficulty: 'intermediate',
    tags: ['checkmark', 'svg', 'stroke', 'success'],
    demoKind: 'interactive',
    cssCode: `
.efx-copy-success-checkmark {
  display: inline-flex;
  margin: 1.25rem 0;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.efx-copy-success-checkmark__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.efx-copy-success-checkmark__button {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.75rem 1.4rem;
  border-radius: 12px;
  border: 1.5px solid #e2e8f0;
  background: #ffffff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-weight: 700;
  font-size: 0.95rem;
  color: #334155;
  transition:
    border-color 0.3s ease,
    background 0.3s ease,
    box-shadow 0.3s ease;
}

.efx-copy-success-checkmark__button:hover {
  border-color: #cbd5e1;
  box-shadow: 0 6px 16px -8px rgba(15, 23, 42, 0.25);
}

.efx-copy-success-checkmark__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #ecfdf5;
  border: 1.5px solid #a7f3d0;
  color: #059669;
  flex: none;
  transition:
    background 0.3s ease,
    border-color 0.3s ease,
    color 0.3s ease,
    transform 0.3s cubic-bezier(0.3, 1.5, 0.5, 1);
}

.efx-copy-success-checkmark__icon {
  width: 15px;
  height: 15px;
  display: block;
}

.efx-copy-success-checkmark__path {
  stroke: currentColor;
  stroke-width: 2.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  transition: stroke-dashoffset 0.5s cubic-bezier(0.4, 0.1, 0.2, 1) 0.12s;
}

.efx-copy-success-checkmark__text {
  position: relative;
  display: inline-block;
}

.efx-copy-success-checkmark__text-copy {
  display: inline-block;
  transition: opacity 0.28s ease, transform 0.28s ease;
}

.efx-copy-success-checkmark__text-done {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  color: #047857;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.28s ease 0.15s, transform 0.28s ease 0.15s;
}

.efx-copy-success-checkmark__input:checked ~ .efx-copy-success-checkmark__button {
  border-color: #10b981;
  background: #ecfdf5;
  box-shadow: 0 8px 20px -10px rgba(16, 185, 129, 0.5);
}

.efx-copy-success-checkmark__input:checked ~ .efx-copy-success-checkmark__button .efx-copy-success-checkmark__badge {
  background: #10b981;
  border-color: #059669;
  color: #ffffff;
  transform: scale(1.12);
}

.efx-copy-success-checkmark__input:checked ~ .efx-copy-success-checkmark__button .efx-copy-success-checkmark__path {
  stroke-dashoffset: 0;
}

.efx-copy-success-checkmark__input:checked ~ .efx-copy-success-checkmark__button .efx-copy-success-checkmark__text-copy {
  opacity: 0;
  transform: translateY(-6px);
  transition-delay: 0s;
}

.efx-copy-success-checkmark__input:checked ~ .efx-copy-success-checkmark__button .efx-copy-success-checkmark__text-done {
  opacity: 1;
  transform: translateY(0);
}

.efx-copy-success-checkmark__input:focus-visible ~ .efx-copy-success-checkmark__button {
  outline: 3px solid rgba(16, 185, 129, 0.35);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .efx-copy-success-checkmark__button,
  .efx-copy-success-checkmark__badge,
  .efx-copy-success-checkmark__path,
  .efx-copy-success-checkmark__text-copy,
  .efx-copy-success-checkmark__text-done {
    transition: none;
  }
}
`,
    htmlSnippet: `
<label class="efx-copy-success-checkmark">
  <input class="efx-copy-success-checkmark__input" type="checkbox" />
  <span class="efx-copy-success-checkmark__button">
    <span class="efx-copy-success-checkmark__badge" aria-hidden="true">
      <svg class="efx-copy-success-checkmark__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path class="efx-copy-success-checkmark__path" d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
    <span class="efx-copy-success-checkmark__text">
      <span class="efx-copy-success-checkmark__text-copy">Copy link</span>
      <span class="efx-copy-success-checkmark__text-done">Copied!</span>
    </span>
  </span>
</label>
`,
  },
];
