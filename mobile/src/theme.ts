/**
 * iEventPlux mobile design tokens.
 * Kept intentionally small — the web app's Tailwind palette maps to these
 * three core tokens plus neutral text/border colors.
 */
export const theme = {
  colors: {
    /** Brand emerald — used for headers, primary actions, ADMITTED states. */
    primary: '#059669',
    primaryDark: '#047857',
    /** Amber accent — highlights, warnings, DUPLICATE states. */
    accent: '#f59e0b',
    /** Stone-50 app background. */
    bg: '#fafaf9',
    card: '#ffffff',
    text: '#1c1917',
    textMuted: '#78716c',
    border: '#e7e5e4',
    success: '#059669',
    warning: '#f59e0b',
    danger: '#dc2626',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 6, md: 10, lg: 14 },
} as const

export type Theme = typeof theme
