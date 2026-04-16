// context-menu.tsx -- Context menu component for right-click actions
// Per D-01, D-02, D-03 from Phase 15 CONTEXT.md
// Phase 18 D-07: submenu support via optional `children` field

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { colors, radii, spacing, fonts } from '../tokens';

// D-01: Flat array item structure with separator support
// Phase 18 D-07: optional `children` field triggers submenu rendering
export interface ContextMenuItem {
  label: string;
  action?: () => void;
  icon?: ComponentType<{ size?: number }>;
  disabled?: boolean;
  separator?: boolean;
  children?: ContextMenuItem[];
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

export function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submenuIndex, setSubmenuIndex] = useState<number | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number } | null>(null);

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
  // Phase 18: click-outside check must also consider the submenu DOM node
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inMenu = menuRef.current?.contains(target);
      const inSubmenu = submenuRef.current?.contains(target);
      if (!inMenu && !inSubmenu) {
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

  // Phase 18: ArrowRight/ArrowLeft keyboard support for submenu enter/exit
  useEffect(() => {
    const handleArrowKeys = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        // Only open submenu if the currently hovered row has children
        if (submenuIndex === null) {
          for (let i = 0; i < items.length; i++) {
            const row = rowRefs.current[i];
            if (items[i]?.children && row?.matches(':hover')) {
              const rect = row.getBoundingClientRect();
              setSubmenuIndex(i);
              setSubmenuPos({ x: rect.right + 2, y: rect.top });
              e.preventDefault();
              return;
            }
          }
        }
      } else if (e.key === 'ArrowLeft') {
        if (submenuIndex !== null) {
          setSubmenuIndex(null);
          e.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', handleArrowKeys);
    return () => document.removeEventListener('keydown', handleArrowKeys);
  }, [items, submenuIndex]);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return;
    if (item.children) return; // submenu parent rows are no-op on click
    item.action?.();
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
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            aria-disabled={item.disabled}
            aria-haspopup={item.children ? 'menu' : undefined}
            aria-expanded={item.children ? submenuIndex === i : undefined}
            onMouseEnter={() => {
              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
              if (!item.children) {
                // Close any open submenu when hovering a non-submenu row (with 150ms delay)
                if (submenuIndex !== null) {
                  hoverTimerRef.current = setTimeout(() => setSubmenuIndex(null), 150);
                }
                return;
              }
              hoverTimerRef.current = setTimeout(() => {
                const row = rowRefs.current[i];
                if (!row) return;
                const rect = row.getBoundingClientRect();
                setSubmenuIndex(i);
                setSubmenuPos({ x: rect.right + 2, y: rect.top });
              }, 150);
            }}
            onMouseLeave={() => {
              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            }}
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
              backgroundColor: submenuIndex === i ? colors.bgBorder : 'transparent',
            }}
          >
            {item.icon && <item.icon size={14} />}
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.children && (
              <span
                style={{
                  fontSize: 10,
                  color: submenuIndex === i ? colors.accent : colors.textMuted,
                }}
              >
                ▸
              </span>
            )}
          </div>
        )
      )}
      {submenuIndex !== null && submenuPos && items[submenuIndex]?.children && (
        <div
          ref={submenuRef}
          onMouseEnter={() => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          }}
          onMouseLeave={() => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = setTimeout(() => setSubmenuIndex(null), 150);
          }}
        >
          <ContextMenu
            items={items[submenuIndex].children!}
            x={submenuPos.x}
            y={submenuPos.y}
            onClose={onClose}
          />
        </div>
      )}
    </div>
  );
}
