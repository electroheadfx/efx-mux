// tab-bar.tsx -- Reusable tab bar component for right panel views (D-11, PANEL-01)
// Migrated from Arrow.js to Preact TSX (Phase 6.1)
// Visual rewrite: Phase 10 pill-style pattern (RightPanel TabButton reference)

import type { Signal } from '@preact/signals';
import { colors, fonts } from '../tokens';

interface TabBarProps {
  tabs: string[];
  activeTab: Signal<string>;
  onSwitch: (tab: string) => void;
}

export function TabBar({ tabs, activeTab, onSwitch }: TabBarProps) {
  return (
    <div class="flex gap-1 px-2 py-1.5 border-b shrink-0 items-center" style={{ backgroundColor: colors.bgBase, borderColor: colors.bgBorder }}>
      {tabs.map(tab => {
        const active = activeTab.value === tab;
        return (
          <button
            class="cursor-pointer transition-all duration-150"
            style={{
              backgroundColor: active ? colors.bgElevated : 'transparent',
              border: active ? `1px solid ${colors.bgSurface}` : '1px solid transparent',
              borderRadius: 6,
              padding: '7px 14px',
              fontFamily: fonts.sans,
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              color: active ? colors.textPrimary : colors.textDim,
            }}
            onClick={() => onSwitch(tab)}
          >{tab}</button>
        );
      })}
    </div>
  );
}
