/**
 * Design tokens test - Phase 10-01
 * Validates src/tokens.ts exports correct values matching reference RESEARCH/theme/tokens.ts
 */

import { colors, fonts, fontSizes, spacing, radii } from './tokens';

// Color token checks
const colorTests = [
  ['colors.bgDeep', colors.bgDeep, '#0B1120'],
  ['colors.bgBase', colors.bgBase, '#111927'],
  ['colors.bgElevated', colors.bgElevated, '#19243A'],
  ['colors.bgBorder', colors.bgBorder, '#243352'],
  ['colors.bgSurface', colors.bgSurface, '#324568'],
  ['colors.accent', colors.accent, '#258AD1'],
  ['colors.accentMuted', colors.accentMuted, '#258AD120'],
  ['colors.textPrimary', colors.textPrimary, '#E6EDF3'],
  ['colors.textSecondary', colors.textSecondary, '#C9D1D9'],
  ['colors.textMuted', colors.textMuted, '#8B949E'],
  ['colors.textDim', colors.textDim, '#556A85'],
  ['colors.statusGreen', colors.statusGreen, '#3FB950'],
  ['colors.statusGreenBg', colors.statusGreenBg, '#3FB95020'],
  ['colors.statusGreenCheck', colors.statusGreenCheck, '#3FB95030'],
  ['colors.statusYellow', colors.statusYellow, '#D29922'],
  ['colors.statusYellowBg', colors.statusYellowBg, '#D2992220'],
  ['colors.statusMutedBg', colors.statusMutedBg, '#8B949E20'],
  ['colors.diffRed', colors.diffRed, '#F85149'],
  ['colors.diffRedBg', colors.diffRedBg, '#F8514915'],
  ['colors.diffRedLineno', colors.diffRedLineno, '#F8514980'],
  ['colors.diffGreenBg', colors.diffGreenBg, '#3FB95015'],
  ['colors.diffGreenLineno', colors.diffGreenLineno, '#3FB95080'],
  ['colors.diffHunkBg', colors.diffHunkBg, '#258AD108'],
  ['colors.agentGradientStart', colors.agentGradientStart, '#A855F7'],
  ['colors.agentGradientEnd', colors.agentGradientEnd, '#6366F1'],
] as const;

// Font checks
const fontTests = [
  ['fonts.sans', fonts.sans, 'Geist'],
  ['fonts.mono', fonts.mono, 'GeistMono'], // Note: no space — matches @font-face in app.css
] as const;

// Font size checks
const fontSizeTests = [
  ['fontSizes.xs', fontSizes.xs, 9],
  ['fontSizes.sm', fontSizes.sm, 10],
  ['fontSizes.md', fontSizes.md, 11],
  ['fontSizes.base', fontSizes.base, 12],
  ['fontSizes.lg', fontSizes.lg, 13],
  ['fontSizes.xl', fontSizes.xl, 15],
  ["fontSizes['2xl']", fontSizes['2xl'], 20],
] as const;

// Spacing checks
const spacingTests = [
  ['spacing.none', spacing.none, 0],
  ['spacing.xs', spacing.xs, 1],
  ['spacing.sm', spacing.sm, 2],
  ['spacing.md', spacing.md, 4],
  ['spacing.lg', spacing.lg, 6],
  ['spacing.xl', spacing.xl, 8],
  ["spacing['2xl']", spacing['2xl'], 10],
  ["spacing['3xl']", spacing['3xl'], 12],
  ["spacing['4xl']", spacing['4xl'], 16],
  ["spacing['5xl']", spacing['5xl'], 20],
  ["spacing['6xl']", spacing['6xl'], 28],
] as const;

// Radii checks
const radiiTests = [
  ['radii.sm', radii.sm, 3],
  ['radii.md', radii.md, 4],
  ['radii.lg', radii.lg, 6],
  ['radii.xl', radii.xl, 8],
] as const;

let passed = 0;
let failed = 0;

function test(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.error(`  FAIL: ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log('\n=== tokens.ts tests ===\n');
console.log('Colors:');
colorTests.forEach(([name, actual, expected]) => test(name, actual, expected));

console.log('\nFonts:');
fontTests.forEach(([name, actual, expected]) => test(name, actual, expected));

console.log('\nFontSizes:');
fontSizeTests.forEach(([name, actual, expected]) => test(name, actual, expected));

console.log('\nSpacing:');
spacingTests.forEach(([name, actual, expected]) => test(name, actual, expected));

console.log('\nRadii:');
radiiTests.forEach(([name, actual, expected]) => test(name, actual, expected));

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  process.exit(1);
}
