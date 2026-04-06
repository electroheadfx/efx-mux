// sidebar.js -- Collapsible sidebar (per D-03, D-15)
// Phase 1: placeholder icon strip only. Project list = Phase 5.
import { html } from '@arrow-js/core';

// Placeholder nav items for Phase 1 icon strip.
// In Phase 5 these become project entries with git status badges.
const NAV_ICONS = [
  { id: 'projects', label: 'Projects', icon: '\u25C8' },
  { id: 'git',      label: 'Git',      icon: '\u238B' },
  { id: 'settings', label: 'Settings', icon: '\u2699' },
];

/**
 * Sidebar component.
 * @param {{ collapsed: { value: () => boolean } }} props
 */
export const Sidebar = ({ collapsed }) => html`
  <aside
    class="${() => `sidebar${collapsed.value() ? ' collapsed' : ''}`}"
    aria-label="Sidebar"
  >
    <div class="sidebar-content">
      <!-- Full sidebar content (hidden when collapsed via CSS opacity) -->
      <div class="sidebar-content-full">
        <div class="sidebar-header" style="
          color: var(--text-bright);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 4px 0 8px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 8px;
        ">GSD MUX</div>
        ${NAV_ICONS.map(item => html`
          <div class="sidebar-nav-item" style="
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 4px;
            color: var(--text);
            cursor: pointer;
            border-radius: 2px;
          " title="${item.label}">
            <span style="font-size: 16px; width: 20px; text-align: center;">${item.icon}</span>
            <span style="font-size: 13px;">${item.label}</span>
          </div>
        `)}
      </div>

      <!-- Icon strip (always visible, even when collapsed) -->
      <div class="sidebar-icons" style="
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: center;
      ">
        ${NAV_ICONS.map(item => html`
          <div style="
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text);
            cursor: pointer;
            font-size: 16px;
          " title="${item.label}">${item.icon}</div>
        `)}
      </div>
    </div>
  </aside>
`;
