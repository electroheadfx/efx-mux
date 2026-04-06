import { reactive, html } from '@arrow-js/core';

const state = reactive({
  sidebarCollapsed: false,
});

function app() {
  const appEl = document.getElementById('app');

  html`
    <div class="sidebar ${() => state.sidebarCollapsed ? 'collapsed' : ''}">
      <div class="sidebar-content">
        <span style="color: var(--accent); font-size: 11px;">GSD MUX</span>
      </div>
    </div>
    <div class="split-handle-v"></div>
    <div class="main-panel">
      <div class="terminal-area">terminal</div>
      <div class="server-pane"></div>
    </div>
    <div class="split-handle-v"></div>
    <div class="right-panel">
      <div class="right-top">gsd viewer</div>
      <div class="split-handle-h"></div>
      <div class="right-bottom">git diff</div>
    </div>
  `(appEl);
}

window.addEventListener('DOMContentLoaded', app);
