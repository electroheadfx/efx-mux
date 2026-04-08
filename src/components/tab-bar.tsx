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
    <div class="flex gap-1 px-2 pt-1.5 pb-0 bg-bg border-b border-border shrink-0">
      {tabs.map(tab => (
        <button
          class={activeTab.value === tab
            ? 'px-3 py-1.5 text-xs cursor-pointer font-[inherit] bg-bg-raised text-text-bright rounded-t border border-border border-b-0 -mb-px relative z-[1] transition-colors duration-150'
            : 'px-3 py-1.5 text-xs cursor-pointer font-[inherit] bg-transparent text-text rounded-t border border-transparent border-b-0 -mb-px transition-colors duration-150 hover:text-text-bright hover:bg-bg-raised/50'}
          onClick={() => onSwitch(tab)}
        >{tab}</button>
      ))}
    </div>
  );
}
