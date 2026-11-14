/**
 * iEventPlux mobile design tokens.
 * Kept intentionally small — the web app's Tailwind palette maps to these
 * three core tokens plus neutral text/border colors.
 */
export const theme = {
  colors: {
    /** Brand emerald — used for headers, primary actions, ADMITTED states. */
    primary: '#087f61',
    primaryDark: '#075744',
    /** Amber accent — highlights, warnings, DUPLICATE states. */
    accent: '#e1ab30',
    /** Stone-50 app background. */
    bg: '#f6faf8',
    card: '#ffffff',
    text: '#15352c',
    textMuted: '#627a70',
    border: '#dbe9e2',
    success: '#059669',
    warning: '#f59e0b',
    danger: '#dc2626',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 9, md: 14, lg: 20 },
} as const

export type Theme = typeof theme
