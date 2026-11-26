/**
 * iEventPlux mobile design tokens.
 * Kept intentionally small — the web app's Tailwind palette maps to these
 * three core tokens plus neutral text/border colors.
 */
export const theme = {
  colors: {
    /** Web --ievx-teal: brand identity must match on every platform. */
    primary: '#087a6d',
    primaryDark: '#06594f',
    /** Amber accent — highlights, warnings, DUPLICATE states. */
    accent: '#e1ab30',
    /** Stone-50 app background. */
    bg: '#f5f7fa',
    card: '#ffffff',
    text: '#162333',
    textMuted: '#59697b',
    border: '#e5eaef',
    success: '#059669',
    warning: '#f59e0b',
    danger: '#dc2626',
  },
  /** Synced with global.css web brand surface for app bars, pills and accent. */
  web: { tealSoft: '#e7f5f0', canvas: '#f5f7fa', brandMark: '#0b8878' },
  typography: { caption: 12, label: 13, body: 14, bodyLine: 21, title: 20, titleLine: 26, heading: 24, headingLine: 30, action: 14 },
  touch: { standard: 48, compact: 44 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 9, md: 14, lg: 20 },
} as const

export type Theme = typeof theme
