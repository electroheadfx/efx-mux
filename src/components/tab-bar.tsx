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
    <div class="flex gap-1 px-2 py-1.5 bg-bg border-b border-border shrink-0 items-center">
      {tabs.map(tab => (
        <button
          class={activeTab.value === tab
            ? 'px-3 py-1 text-xs cursor-pointer font-[inherit] bg-bg-raised text-text-bright rounded-full border border-border transition-all duration-150'
            : 'px-3 py-1 text-xs cursor-pointer font-[inherit] bg-transparent text-text rounded-full border border-transparent transition-all duration-150 hover:text-text-bright hover:bg-bg-raised/40'}
          onClick={() => onSwitch(tab)}
        >{tab}</button>
      ))}
    </div>
  );
}
