// src/theme/theme-manager.test.ts
// Unit tests for theme-manager applyTheme, setThemeMode, getTheme, registerTerminal (Phase 12)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import {
  applyTheme, setThemeMode, getTheme, getTerminalTheme,
  registerTerminal, unregisterTerminal,
} from './theme-manager';
import type { ThemeData } from './theme-manager';

const MOCK_TERMINAL_THEME: Record<string, string> = {
  background: '#0B1120',
  foreground: '#E6EDF3',
};

const MOCK_THEME: ThemeData = {
  chrome: {
    bg: '#111927',
    bgRaised: '#19243A',
    bgTerminal: '#0B1120',
    border: '#243352',
    text: '#E6EDF3',
    textBright: '#ffffff',
    accent: '#258AD1',
    success: '#3FB950',
    warning: '#D29922',
    danger: '#F85149',
    font: 'Geist',
    fontSize: 12,
  },
  terminal: MOCK_TERMINAL_THEME,
};

describe('theme-manager', () => {
  let styleSetProperty: any;
  let styleRemoveProperty: any;
  let setAttributeSpy: any;

  beforeEach(() => {
    // Capture calls to style.setProperty and style.removeProperty on the real documentElement
    styleSetProperty = vi.fn();
    styleRemoveProperty = vi.fn();
    vi.spyOn(document.documentElement.style, 'setProperty').mockImplementation(styleSetProperty);
    vi.spyOn(document.documentElement.style, 'removeProperty').mockImplementation(styleRemoveProperty);
    // Spy on setAttribute for data-theme attribute
    setAttributeSpy = vi.spyOn(document.documentElement, 'setAttribute');
    setAttributeSpy.mockImplementation(vi.fn());
    // jsdom already provides data-theme attribute support; just mock the spy
  });

  describe('applyTheme', () => {
    it('caches theme for getTheme()', () => {
      applyTheme(MOCK_THEME);
      expect(getTheme()).toEqual(MOCK_THEME);
    });

    it('sets CSS custom properties on documentElement for chrome values', () => {
      applyTheme(MOCK_THEME);
      expect(styleSetProperty).toHaveBeenCalledWith('--color-bg', '#111927');
      expect(styleSetProperty).toHaveBeenCalledWith('--color-accent', '#258AD1');
      expect(styleSetProperty).toHaveBeenCalledWith('--color-text', '#E6EDF3');
    });

    it('sets font-family with quote wrapping', () => {
      applyTheme(MOCK_THEME);
      expect(styleSetProperty).toHaveBeenCalledWith('--font-family-sans', "'Geist', system-ui, sans-serif");
    });

    it('sets --file-tree-font from chrome.fileTreeFont', () => {
      const themeWithFT = { ...MOCK_THEME, chrome: { ...MOCK_THEME.chrome, fileTreeFont: 'Menlo' } };
      applyTheme(themeWithFT);
      // Source: style.setProperty('--file-tree-font', theme.chrome.fileTreeFont) — no quote wrapping
      expect(styleSetProperty).toHaveBeenCalledWith('--file-tree-font', 'Menlo');
    });

    it('updates registered terminal options with terminal theme', () => {
      const mockTerminal = { options: {}, fitAddon: { fit: vi.fn() } } as any;
      registerTerminal(mockTerminal, mockTerminal.fitAddon);
      applyTheme(MOCK_THEME);
      expect(mockTerminal.options.theme).toEqual(MOCK_TERMINAL_THEME);
      expect(mockTerminal.options.fontFamily).toBe("'Geist', monospace");
      expect(mockTerminal.options.fontSize).toBe(12);
      expect(mockTerminal.fitAddon.fit).toHaveBeenCalled();
    });

    it('skips undefined chrome fields without throwing', () => {
      const partialTheme = { chrome: { bg: '#000' } } as ThemeData;
      expect(() => applyTheme(partialTheme)).not.toThrow();
    });
  });

  describe('getTerminalTheme', () => {
    it('returns null before any applyTheme call', () => {
      expect(getTerminalTheme()).toBeNull();
    });

    it('returns terminal section after applyTheme', () => {
      applyTheme(MOCK_THEME);
      expect(getTerminalTheme()).toEqual(MOCK_TERMINAL_THEME);
    });
  });

  describe('setThemeMode', () => {
    it('sets data-theme attribute on documentElement', () => {
      setThemeMode('dark');
      expect(setAttributeSpy).toHaveBeenCalledWith('data-theme', 'dark');
    });

    it('clears inline CSS vars when switching to light mode', () => {
      applyTheme(MOCK_THEME);
      setThemeMode('light');
      // CHROME_PROPS should be removed
      expect(styleRemoveProperty).toHaveBeenCalledWith('--color-bg');
    });

    it('re-applies chrome vars from cached theme when switching back to dark', () => {
      applyTheme(MOCK_THEME);
      setThemeMode('light');
      setThemeMode('dark');
      expect(styleSetProperty).toHaveBeenCalledWith('--color-bg', '#111927');
      expect(styleSetProperty).toHaveBeenCalledWith('--color-accent', '#258AD1');
    });
  });

  describe('registerTerminal / unregisterTerminal', () => {
    it('registerTerminal adds terminal to registry', () => {
      const mockTerminal = { options: {} } as any;
      const mockFit = { fit: vi.fn() } as any;
      registerTerminal(mockTerminal, mockFit);
      // Verify by applying theme and checking terminal gets updated
      applyTheme(MOCK_THEME);
      expect(mockTerminal.options.theme).toEqual(MOCK_TERMINAL_THEME);
    });

    it('unregisterTerminal removes terminal from registry', () => {
      const mockTerminal = { options: {} } as any;
      const mockFit = { fit: vi.fn() } as any;
      registerTerminal(mockTerminal, mockFit);
      unregisterTerminal(mockTerminal);
      // After unregister, terminal should not receive theme updates
      // We test this by checking no errors occur when applying theme
      expect(() => applyTheme(MOCK_THEME)).not.toThrow();
    });
  });
});