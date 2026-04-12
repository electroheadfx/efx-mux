// src/tokens.test.ts
// Unit tests for design tokens constant validation (Phase 12)
import { describe, it, expect } from 'vitest';
import { colors, fonts, fontSizes, spacing, radii } from './tokens';

describe('tokens', () => {
  describe('colors', () => {
    // Note: tokens use `as const` (readonly properties) not Object.freeze()
    // so Object.isFrozen() returns false. Test readonly behavior instead.
    it('has bgDeep defined', () => {
      expect(colors.bgDeep).toBe('#0B1120');
    });

    it('has bgBase defined', () => {
      expect(colors.bgBase).toBe('#111927');
    });

    it('has bgElevated defined', () => {
      expect(colors.bgElevated).toBe('#19243A');
    });

    it('has accent defined', () => {
      expect(colors.accent).toBe('#258AD1');
    });

    it('has textPrimary defined', () => {
      expect(colors.textPrimary).toBe('#E6EDF3');
    });

    it('has textMuted defined', () => {
      expect(colors.textMuted).toBe('#8B949E');
    });

    it('has statusGreen defined', () => {
      expect(colors.statusGreen).toBe('#3FB950');
    });

    it('has diffRed defined', () => {
      expect(colors.diffRed).toBe('#F85149');
    });

    it('has agentGradientStart defined', () => {
      expect(colors.agentGradientStart).toBe('#A855F7');
    });

    it('has all expected color keys', () => {
      const expectedKeys = [
        'bgDeep', 'bgBase', 'bgElevated', 'bgBorder', 'bgSurface',
        'accent', 'accentMuted', 'textPrimary', 'textSecondary', 'textMuted', 'textDim',
        'statusGreen', 'statusGreenBg', 'statusGreenCheck',
        'statusYellow', 'statusYellowBg', 'statusMutedBg',
        'diffRed', 'diffRedBg', 'diffRedLineno', 'diffGreenBg', 'diffGreenLineno', 'diffHunkBg',
        'agentGradientStart', 'agentGradientEnd',
      ];
      for (const key of expectedKeys) {
        expect(colors[key as keyof typeof colors]).toBeDefined();
        expect(colors[key as keyof typeof colors]).not.toBeNull();
        expect(typeof colors[key as keyof typeof colors]).toBe('string');
      }
    });
  });

  describe('fonts', () => {
    it('has sans defined', () => {
      expect(fonts.sans).toBe('Geist');
    });

    it('has mono defined', () => {
      expect(fonts.mono).toBe('GeistMono');
    });

    it('has no extra keys', () => {
      expect(Object.keys(fonts)).toHaveLength(2);
    });
  });

  describe('fontSizes', () => {
    it('has all size keys defined as numbers', () => {
      const expectedKeys = ['xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl'];
      for (const key of expectedKeys) {
        expect(fontSizes[key as keyof typeof fontSizes]).toBeDefined();
        expect(typeof fontSizes[key as keyof typeof fontSizes]).toBe('number');
      }
    });

    it('xs is 9', () => { expect(fontSizes.xs).toBe(9); });
    it('sm is 10', () => { expect(fontSizes.sm).toBe(10); });
    it('md is 11', () => { expect(fontSizes.md).toBe(11); });
    it('base is 12', () => { expect(fontSizes.base).toBe(12); });
    it('lg is 13', () => { expect(fontSizes.lg).toBe(13); });
    it('xl is 15', () => { expect(fontSizes.xl).toBe(15); });
    it('2xl is 20', () => { expect(fontSizes['2xl']).toBe(20); });
  });

  describe('spacing', () => {
    it('has all spacing keys defined as numbers', () => {
      const expectedKeys = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'];
      for (const key of expectedKeys) {
        expect(spacing[key as keyof typeof spacing]).toBeDefined();
        expect(typeof spacing[key as keyof typeof spacing]).toBe('number');
      }
    });

    it('spacing is monotonically increasing', () => {
      const values = Object.values(spacing);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1]);
      }
    });
  });

  describe('radii', () => {
    it('has sm defined as 3', () => { expect(radii.sm).toBe(3); });
    it('has md defined as 4', () => { expect(radii.md).toBe(4); });
    it('has lg defined as 6', () => { expect(radii.lg).toBe(6); });
    it('has xl defined as 8', () => { expect(radii.xl).toBe(8); });

    it('has exactly 4 keys', () => {
      expect(Object.keys(radii)).toHaveLength(4);
    });
  });
});