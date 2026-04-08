// ansi-html.ts -- Convert ANSI escape codes to styled HTML (Phase 7)
// T-07-03 mitigation: HTML-escape BEFORE processing ANSI codes to prevent XSS

/** Solarized Dark ANSI color map */
const ANSI_COLORS: Record<number, string> = {
  30: '#282d3a', 31: '#dc322f', 32: '#859900', 33: '#b58900',
  34: '#268bd2', 35: '#d33682', 36: '#2aa198', 37: '#eee8d5',
  90: '#657b83', 91: '#cb4b16', 92: '#859900', 93: '#b58900',
  94: '#268bd2', 95: '#d33682', 96: '#2aa198', 97: '#fdf6e3',
};

/**
 * Convert ANSI-escaped text to styled HTML.
 * HTML-escapes input first (T-07-03), then processes ANSI sequences.
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

    for (const code of parts) {
      if (code === 0) {
        // Reset: close all open spans
        result += '</span>'.repeat(openSpans);
        openSpans = 0;
        continue;
      }
      if (code === 1) {
        styles.push('font-weight:bold');
      }
      if (ANSI_COLORS[code]) {
        styles.push(`color:${ANSI_COLORS[code]}`);
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
