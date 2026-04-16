// tab-bar.tsx -- Reusable tab bar component for right panel views (D-11, PANEL-01)
// Visual rewrite: Phase 10 pill-style pattern (RightPanel TabButton reference)

import type { Signal } from '@preact/signals';
import { colors, fonts, spacing } from '../tokens';

interface TabBarProps {
  tabs: string[];
  activeTab: Signal<string>;
  onSwitch: (tab: string) => void;
}

export function TabBar({ tabs, activeTab, onSwitch }: TabBarProps) {
  return (
    <div class="flex px-2 py-2 border-b shrink-0 items-center" style={{ backgroundColor: colors.bgBase, borderColor: colors.bgBorder }}>
      {tabs.map(tab => {
        const active = activeTab.value === tab;
        return (
          <button
            class="cursor-pointer transition-all duration-150"
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: active ? `2px solid ${colors.accent}` : '2px solid transparent',
              marginBottom: -1,
              padding: `${spacing.xl}px ${spacing['3xl']}px`,
              fontFamily: fonts.sans,
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              color: active ? colors.textPrimary : colors.textMuted,
            }}
            onClick={() => onSwitch(tab)}
          >{tab}</button>
        );
      })}
    </div>
  );
}
