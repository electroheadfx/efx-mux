/**
 * Design tokens for Phase 10 pixel-perfect rewrite
 * Source: RESEARCH/theme/tokens.ts
 *
 * This file is the canonical source of programmatic token values
 * consumed by components via inline style={{}} props.
 */

// ── Color Palette ──────────────────────────────────────────────
export const colors = {
  bgDeep: '#0B1120',
  bgBase: '#111927',
  bgElevated: '#19243A',
  bgBorder: '#243352',
  bgSurface: '#324568',
  accent: '#258AD1',
  accentMuted: '#258AD120',
  textPrimary: '#E6EDF3',
  textSecondary: '#C9D1D9',
  textMuted: '#8B949E',
  textDim: '#556A85',
  statusGreen: '#3FB950',
  statusGreenBg: '#3FB95020',
  statusGreenCheck: '#3FB95030',
  statusYellow: '#D29922',
  statusYellowBg: '#D2992220',
  statusMutedBg: '#8B949E20',
  diffRed: '#F85149',
  diffRedBg: '#F8514915',
  diffRedLineno: '#F8514980',
  diffGreenBg: '#3FB95015',
  diffGreenLineno: '#3FB95080',
  diffHunkBg: '#258AD108',
  agentGradientStart: '#A855F7',
  agentGradientEnd: '#6366F1',
} as const;

// ── Typography ─────────────────────────────────────────────────
export const fonts = {
  sans: 'Geist',
  // NOTE: 'GeistMono' (no space) matches @font-face name in app.css
  // The reference RESEARCH/theme/tokens.ts uses 'Geist Mono' (with space)
  // which would break fonts in the production app.
  mono: 'GeistMono',
} as const;

export const fontSizes = {
  xs: 9,
  sm: 10,
  md: 11,
  base: 12,
  lg: 13,
  xl: 15,
  '2xl': 20,
} as const;

// ── Spacing ────────────────────────────────────────────────────
export const spacing = {
  none: 0,
  xs: 1,
  sm: 2,
  md: 4,
  lg: 6,
  xl: 8,
  '2xl': 10,
  '3xl': 12,
  '4xl': 16,
  '5xl': 20,
  '6xl': 28,
} as const;

// ── Radii ──────────────────────────────────────────────────────
export const radii = {
  sm: 3,
  md: 4,
  lg: 6,
  xl: 8,
} as const;
