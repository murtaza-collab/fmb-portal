/**
 * FMB design tokens for React inline styles.
 *
 * These are `var(--fmb-*)` references, NOT literal hexes — the actual values
 * live in one place, `app/globals.css`. Changing a colour there updates plain
 * CSS, every Bootstrap component, and every inline style at once.
 *
 *   import { theme } from '@/lib/theme'
 *   <div style={{ color: theme.gold, fontSize: theme.text.base }} />
 *
 * For a colour with opacity, use alpha() — the raw hex+alpha suffix trick
 * (`'#d4a03220'`) does not work with var(), so alpha() goes through the
 * --fmb-gold-rgb triplet instead.
 */
export const theme = {
  // Brand
  gold:       'var(--fmb-gold)',
  goldHover:  'var(--fmb-gold-hover)',
  goldActive: 'var(--fmb-gold-active)',
  goldAccent: 'var(--fmb-gold-accent)',
  goldDeep:   'var(--fmb-gold-deep)',
  brown:      'var(--fmb-brown)',

  // Semantic
  success: 'var(--fmb-success)',
  danger:  'var(--fmb-danger)',
  warning: 'var(--fmb-warning)',
  info:    'var(--fmb-info)',
  muted:   'var(--fmb-muted)',

  // Surfaces
  surfaceSubtle: 'var(--fmb-surface-subtle)',
  border:        'var(--fmb-border)',

  // Typography
  font: {
    sans: 'var(--fmb-font-sans)',
    mono: 'var(--fmb-font-mono)',
  },
  text: {
    xs:   'var(--fmb-text-xs)',
    sm:   'var(--fmb-text-sm)',
    base: 'var(--fmb-text-base)',
    md:   'var(--fmb-text-md)',
    lg:   'var(--fmb-text-lg)',
  },

  // Shape
  radiusSm: 'var(--fmb-radius-sm)',
  radius:   'var(--fmb-radius)',
} as const

/** Brand gold at a given opacity, e.g. alpha.gold(0.12) */
export const alpha = {
  gold: (a: number) => `rgba(var(--fmb-gold-rgb), ${a})`,
  info: (a: number) => `rgba(var(--fmb-info-rgb), ${a})`,
} as const
