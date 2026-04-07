// right-panel.js -- Right panel with two vertically stacked sub-panels (per D-04)
// Phase 1: placeholder content. Tab bars + views wired in Phase 6.
import { html } from '@arrow-js/core';

/**
 * RightPanel component.
 * Two sub-panels separated by a horizontal split handle.
 * The handle is static in Phase 1 -- drag behavior wired in Plan 03.
 */
export const RightPanel = () => html`
  <aside class="right-panel" aria-label="Right panel">
    <div class="right-top">
      <span style="color: var(--text); font-size: 12px; letter-spacing: 0.04em;">
        [ GSD Viewer / Diff -- Phase 6 ]
      </span>
    </div>

    <div
      class="split-handle-h"
      data-handle="right-h"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize right panels"
    ></div>

    <div class="right-bottom">
      <span style="color: var(--text); font-size: 12px; letter-spacing: 0.04em;">
        [ File Tree / Bash -- Phase 6 ]
      </span>
    </div>
  </aside>
`;
