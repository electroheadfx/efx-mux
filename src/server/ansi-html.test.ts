// src/server/ansi-html.test.ts
// Unit tests for ansiToHtml and extractServerUrl (Phase 12)
import { describe, it, expect } from 'vitest';
import { ansiToHtml, extractServerUrl } from './ansi-html';

describe('ansiToHtml', () => {
  // Happy path
  it('converts plain text without ANSI codes', () => {
    expect(ansiToHtml('hello world')).toBe('hello world');
  });

  it('converts bold code', () => {
    const result = ansiToHtml('\x1b[1mbold\x1b[0m');
    expect(result).toContain('font-weight:bold');
  });

  it('converts basic foreground colors (30-37)', () => {
    const result = ansiToHtml('\x1b[34mblue\x1b[0m');
    expect(result).toContain('color:#268bd2');
  });

  it('converts basic background colors (40-47)', () => {
    const result = ansiToHtml('\x1b[44mbluebg\x1b[0m');
    expect(result).toContain('background-color:#268bd2');
  });

  // color256 boundaries
  it('maps color256 0 (first standard)', () => {
    const result = ansiToHtml('\x1b[38;5;0m\x1b[0m');
    expect(result).toContain('color:#282d3a');
  });

  it('maps color256 7 (last standard)', () => {
    const result = ansiToHtml('\x1b[38;5;7m\x1b[0m');
    expect(result).toContain('color:#eee8d5');
  });

  it('maps color256 8 (first bright)', () => {
    const result = ansiToHtml('\x1b[38;5;8m\x1b[0m');
    expect(result).toContain('color:#657b83');
  });

  it('maps color256 15 (last bright)', () => {
    const result = ansiToHtml('\x1b[38;5;15m\x1b[0m');
    expect(result).toContain('color:#fdf6e3');
  });

  it('maps color256 16 (first RGB cube)', () => {
    const result = ansiToHtml('\x1b[38;5;16m\x1b[0m');
    expect(result).toContain('color:#');
  });

  it('maps color256 231 (white in RGB cube)', () => {
    const result = ansiToHtml('\x1b[38;5;231m\x1b[0m');
    expect(result).toContain('color:#ffffff');
  });

  it('maps color256 232 (first grayscale)', () => {
    const result = ansiToHtml('\x1b[38;5;232m\x1b[0m');
    expect(result).toContain('color:#080808');
  });

  it('maps color256 255 (last grayscale)', () => {
    const result = ansiToHtml('\x1b[38;5;255m\x1b[0m');
    // Formula: 8 + (255-232)*10 = 8 + 230 = 238 = 0xEE
    expect(result).toContain('color:#eeeeee');
  });

  it('returns fallback for out-of-range color256', () => {
    const result = ansiToHtml('\x1b[38;5;999m\x1b[0m');
    expect(result).toContain('color:#8d999a');
  });

  // truecolor
  it('converts truecolor foreground 38;2;R;G;B', () => {
    const result = ansiToHtml('\x1b[38;2;255;128;0morange\x1b[0m');
    expect(result).toContain('color:#ff8000');
  });

  it('converts truecolor background 48;2;R;G;B', () => {
    const result = ansiToHtml('\x1b[48;2;0;0;128mbluebg\x1b[0m');
    expect(result).toContain('background-color:#000080');
  });

  // XSS vectors (HTML-escaped before ANSI processing per T-07-03)
  // ansiToHtml only escapes & < > — not " — so attribute structure is preserved after escaping
  it('escapes script tag in input (tag parsing prevented)', () => {
    const result = ansiToHtml('<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
    // No JS execution possible since < > are entity-encoded
  });

  it('escapes img onerror XSS vector (angle brackets entity-encoded)', () => {
    const result = ansiToHtml('<img src=x onerror="alert(1)">');
    // < and > are entity-encoded, preventing tag parsing
    expect(result).toContain('&lt;img');
    expect(result).toContain('&gt;');
    // onerror attribute text is preserved (but no tag = no execution)
    expect(result).toContain('onerror');
  });

  it('escapes ampersand in XSS vector (quotes pass through)', () => {
    // Input: &lt; — & becomes &amp;, < becomes &lt; (both escaped in sequence)
    const result = ansiToHtml('"&lt;"');
    expect(result).toContain('&amp;');   // & -> &amp;
    expect(result).toContain('&amp;lt;') // & was escaped first, then < in &lt; is also escaped
    expect(result).toContain('"');        // " passes through (function only escapes & < >)
  });

  // Reset sequences
  it('reset code 0 closes all open spans', () => {
    const result = ansiToHtml('\x1b[1m\x1b[34mbold+blue\x1b[0mafter');
    // Should have closing spans before "after"
    expect(result).toContain('</span>');
  });

  it('multiple resets do not produce malformed HTML', () => {
    const result = ansiToHtml('\x1b[0m\x1b[0m\x1b[0m');
    expect(result).not.toContain('\x1b');
  });

  // Nested codes
  it('handles nested ANSI codes (inner reset then new style)', () => {
    const result = ansiToHtml('\x1b[1m\x1b[34mblue-bold\x1b[0mnormal\x1b[0m');
    // After inner reset, "normal" should have no color
    expect(result).not.toContain('normal</span>');
  });

  it('converts newlines to <br>', () => {
    const result = ansiToHtml('line1\nline2');
    expect(result).toContain('<br>');
  });
});

describe('extractServerUrl', () => {
  it('extracts http://localhost URL', () => {
    expect(extractServerUrl('Server running at http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('extracts http://127.0.0.1 URL with port', () => {
    expect(extractServerUrl('Listen: http://127.0.0.1:8080/path')).toBe('http://127.0.0.1:8080/path');
  });

  it('extracts https localhost URL', () => {
    expect(extractServerUrl('https://localhost:4433')).toBe('https://localhost:4433');
  });

  it('returns null when no localhost URL present', () => {
    expect(extractServerUrl('Server running at external.com:8080')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractServerUrl('')).toBeNull();
  });
});