// context-menu.tsx -- Context menu component for right-click actions
// Per D-01, D-02, D-03 from CONTEXT.md

import { useEffect, useRef } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { colors, radii, spacing, fonts } from '../tokens';

// D-01: Flat array item structure with separator support
export interface ContextMenuItem {
  label: string;
  action: () => void;
  icon?: ComponentType<{ size?: number }>;
  disabled?: boolean;
  separator?: boolean;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

export function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // D-02: Auto-flip positioning -- flip to opposite side when menu would overflow viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const flipX = x + rect.width > window.innerWidth;
    const flipY = y + rect.height > window.innerHeight;
    if (flipX) menuRef.current.style.left = `${x - rect.width}px`;
    if (flipY) menuRef.current.style.top = `${y - rect.height}px`;
  }, [x, y]);

  // D-03: Close triggers: click outside, Escape key, item selection (NOT scroll parent)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return;
    item.action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        backgroundColor: colors.bgElevated,
        border: `1px solid ${colors.bgBorder}`,
        borderRadius: radii.lg,
        padding: `${spacing.sm}px 0`,
        zIndex: 1000,
        minWidth: 160,
      }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div
            key={i}
            role="separator"
            style={{
              height: 1,
              backgroundColor: colors.bgBorder,
              margin: `${spacing.sm}px 0`,
            }}
          />
        ) : (
          <div
            key={i}
            role="menuitem"
            aria-disabled={item.disabled}
            onClick={() => handleItemClick(item)}
            style={{
              padding: `${spacing.lg}px ${spacing['4xl']}px`,
              fontFamily: fonts.sans,
              fontSize: 13,
              color: item.disabled ? colors.textDim : colors.textPrimary,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xl,
            }}
          >
            {item.icon && <item.icon size={14} />}
            {item.label}
          </div>
        )
      )}
    </div>
  );
}
