/**
 * FMB design tokens for React inline styles.
 *
 * These are `var(--fmb-*)` references, NOT literal hexes — the actual values
 * live in one place, `app/globals.css`. Changing a colour there updates plain
 * CSS, every Bootstrap component, and every inline style at once.
 *
 *   import { theme } from '@/lib/theme'
 *   <div style={{ color: theme.primary, fontSize: theme.text.base }} />
 *
 * The palette is jade and gold: `primary` (jade) carries the interface and is
 * the only colour that belongs under white text; `accent` (gold) is for dark
 * surfaces only — the active nav item, a highlight on the sidebar. Gold on a
 * light background fails contrast, which is exactly the defect this palette
 * replaced, so reach for `primaryDeep` for text and links instead.
 *
 * For a colour with opacity, use alpha() — the raw hex+alpha suffix trick
 * (`'#0b6b5320'`) does not work with var(), so alpha() goes through the
 * --fmb-*-rgb triplets instead.
 */
export const theme = {
  // Brand
  primary:       'var(--fmb-primary)',
  primaryHover:  'var(--fmb-primary-hover)',
  primaryActive: 'var(--fmb-primary-active)',
  primaryDeep:   'var(--fmb-primary-deep)',
  accent:        'var(--fmb-accent)',
  ground:        'var(--fmb-ground)',
  groundDeep:    'var(--fmb-ground-deep)',

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

/** A brand colour at a given opacity, e.g. alpha.primary(0.12) */
export const alpha = {
  primary: (a: number) => `rgba(var(--fmb-primary-rgb), ${a})`,
  accent:  (a: number) => `rgba(var(--fmb-accent-rgb), ${a})`,
  info:    (a: number) => `rgba(var(--fmb-info-rgb), ${a})`,
} as const
