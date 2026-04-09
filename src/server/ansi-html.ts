// ansi-html.ts -- Convert ANSI escape codes to styled HTML (Phase 7)
// T-07-03 mitigation: HTML-escape BEFORE processing ANSI codes to prevent XSS
// 07-04: Extended to handle 256-color (38;5;N) and truecolor (38;2;R;G;B) sequences

/** Solarized Dark ANSI color map */
const ANSI_COLORS: Record<number, string> = {
  30: '#282d3a', 31: '#dc322f', 32: '#859900', 33: '#b58900',
  34: '#268bd2', 35: '#d33682', 36: '#2aa198', 37: '#eee8d5',
  90: '#657b83', 91: '#cb4b16', 92: '#859900', 93: '#b58900',
  94: '#268bd2', 95: '#d33682', 96: '#2aa198', 97: '#fdf6e3',
};

/** Background color ANSI map (40-47, 100-107) */
const ANSI_BG_COLORS: Record<number, string> = {
  40: '#282d3a', 41: '#dc322f', 42: '#859900', 43: '#b58900',
  44: '#268bd2', 45: '#d33682', 46: '#2aa198', 47: '#eee8d5',
  100: '#657b83', 101: '#cb4b16', 102: '#859900', 103: '#b58900',
  104: '#268bd2', 105: '#d33682', 106: '#2aa198', 107: '#fdf6e3',
};

/**
 * Convert xterm-256color palette index to hex color string.
 * Colors 0-7: standard (map to ANSI 30+n), 8-15: bright (map to ANSI 90+(n-8)),
 * 16-231: 6x6x6 RGB cube, 232-255: grayscale ramp.
 */
function color256(n: number): string {
  if (n < 0 || n > 255) return '#8d999a'; // fallback to text color
  if (n < 8) return ANSI_COLORS[30 + n] ?? '#8d999a';
  if (n < 16) return ANSI_COLORS[90 + (n - 8)] ?? '#8d999a';
  if (n < 232) {
    // 6x6x6 RGB cube (colors 16-231)
    const idx = n - 16;
    const ri = Math.floor(idx / 36);
    const gi = Math.floor((idx % 36) / 6);
    const bi = idx % 6;
    const levels = [0, 95, 135, 175, 215, 255];
    const r = levels[ri], g = levels[gi], b = levels[bi];
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  // Grayscale ramp (colors 232-255)
  const v = 8 + (n - 232) * 10;
  return `#${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}${v.toString(16).padStart(2, '0')}`;
}

/**
 * Convert ANSI-escaped text to styled HTML.
 * HTML-escapes input first (T-07-03), then processes ANSI sequences.
 * Handles basic colors, 256-color (38;5;N / 48;5;N), and truecolor (38;2;R;G;B / 48;2;R;G;B).
 */
export function ansiToHtml(text: string): string {
  // Step 1: HTML-escape (T-07-03: prevents XSS from crafted server output)
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Step 2: Replace ANSI escape sequences with HTML spans
  let openSpans = 0;
  escaped = escaped.replace(/\x1b\[(\d+(?:;\d+)*)m/g, (_match, codes: string) => {
    const parts = codes.split(';').map(Number);
    const styles: string[] = [];
    let result = '';

    for (let i = 0; i < parts.length; i++) {
      const code = parts[i];

      if (code === 0) {
        // Reset: close all open spans
        result += '</span>'.repeat(openSpans);
        openSpans = 0;
        continue;
      }

      // 256-color foreground: 38;5;N
      if (code === 38 && parts[i + 1] === 5 && i + 2 < parts.length) {
        styles.push(`color:${color256(parts[i + 2])}`);
        i += 2;
        continue;
      }

      // Truecolor foreground: 38;2;R;G;B
      if (code === 38 && parts[i + 1] === 2 && i + 4 < parts.length) {
        const r = parts[i + 2], g = parts[i + 3], b = parts[i + 4];
        styles.push(`color:#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
        i += 4;
        continue;
      }

      // 256-color background: 48;5;N
      if (code === 48 && parts[i + 1] === 5 && i + 2 < parts.length) {
        styles.push(`background-color:${color256(parts[i + 2])}`);
        i += 2;
        continue;
      }

      // Truecolor background: 48;2;R;G;B
      if (code === 48 && parts[i + 1] === 2 && i + 4 < parts.length) {
        const r = parts[i + 2], g = parts[i + 3], b = parts[i + 4];
        styles.push(`background-color:#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
        i += 4;
        continue;
      }

      // Bold
      if (code === 1) {
        styles.push('font-weight:bold');
      }

      // Basic foreground colors (30-37, 90-97)
      if (ANSI_COLORS[code]) {
        styles.push(`color:${ANSI_COLORS[code]}`);
      }

      // Basic background colors (40-47, 100-107)
      if (ANSI_BG_COLORS[code]) {
        styles.push(`background-color:${ANSI_BG_COLORS[code]}`);
      }
    }

    if (styles.length > 0) {
      openSpans++;
      result += `<span style="${styles.join(';')}">`;
    }

    return result;
  });

  // Step 3: Strip any remaining unhandled ANSI sequences
  escaped = escaped.replace(/\x1b\[[^m]*m/g, '');

  // Step 4: Close any remaining open spans
  escaped += '</span>'.repeat(openSpans);

  // Step 5: Convert newlines to <br> for HTML rendering
  escaped = escaped.replace(/\n/g, '<br>');

  return escaped;
}

/**
 * Extract a localhost URL from server output text.
 * Returns the first match or null.
 */
export function extractServerUrl(text: string): string | null {
  const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/\S*)?/);
  return match ? match[0] : null;
}
