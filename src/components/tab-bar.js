// tab-bar.js -- Reusable tab bar component for right panel views (D-11, PANEL-01)
// Foundation for all Wave 2 views: GSD Viewer, Diff Viewer, File Tree, Terminal
import { html } from '@arrow-js/core';

/**
 * TabBar component.
 * @param {string[]} tabs - Array of tab label strings.
 * @param {() => string} activeTab - Reactive getter returning the currently active tab.
 * @param {(tab: string) => void} onSwitch - Callback invoked when a tab is clicked.
 * @returns Arrow.js html template
 */
export const TabBar = (tabs, activeTab, onSwitch) => html`
  <div class="tab-bar">
    ${tabs.map(tab => html`
      <button
        class="${() => activeTab() === tab ? 'tab-btn active' : 'tab-btn'}"
        @click="${() => onSwitch(tab)}"
      >${tab}</button>
    `)}
  </div>
`;
