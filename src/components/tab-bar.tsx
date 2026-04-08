// tab-bar.tsx -- Reusable tab bar component for right panel views (D-11, PANEL-01)
// Migrated from Arrow.js to Preact TSX (Phase 6.1)

import type { Signal } from '@preact/signals';

interface TabBarProps {
  tabs: string[];
  activeTab: Signal<string>;
  onSwitch: (tab: string) => void;
}

export function TabBar({ tabs, activeTab, onSwitch }: TabBarProps) {
  return (
    <div class="flex gap-0.5 px-2 pt-1 bg-bg border-b border-border shrink-0">
      {tabs.map(tab => (
        <button
          class={activeTab.value === tab
            ? 'px-4 py-1.5 text-xs cursor-pointer font-[inherit] bg-bg-raised border-b-2 border-accent text-text-bright -mb-px'
            : 'px-4 py-1.5 text-xs cursor-pointer font-[inherit] bg-transparent border-b-2 border-transparent text-text -mb-px hover:bg-bg-raised'}
          onClick={() => onSwitch(tab)}
        >{tab}</button>
      ))}
    </div>
  );
}
