// utils/session-name.ts -- Shared tmux session name derivation
// Sanitizes to alphanumeric + hyphen + underscore (matching pty.rs sanitization).

export function projectSessionName(projectName: string | null, suffix?: string): string {
  if (!projectName) return suffix ? `efx-mux-${suffix}` : 'efx-mux';
  const base = projectName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  return suffix ? `${base}-${suffix}` : base;
}
