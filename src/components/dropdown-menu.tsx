// dropdown-menu.tsx -- Dropdown menu component with keyboard navigation
// Per D-04, D-05, D-06 from CONTEXT.md

import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import type { ComponentType, VNode } from 'preact';
import { colors, radii, spacing, fonts } from '../tokens';

// Reuse same item structure as ContextMenu (D-01)
export interface DropdownItem {
  label: string;
  action: () => void;
  icon?: ComponentType<any>;
  disabled?: boolean;
  separator?: boolean;
}

export interface DropdownProps {
  items: DropdownItem[];
  trigger: (props: {
    onClick: () => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
  }) => VNode;
}

export function Dropdown({ items, trigger }: DropdownProps) {
  // D-04: Uncontrolled state -- component manages open/close internally
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const typeaheadBuffer = useRef('');
  const typeaheadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get selectable items (not separators, not disabled)
  const selectableItems = items.filter(i => !i.separator && !i.disabled);
  const selectableIndices = items.reduce<number[]>((acc, item, i) => {
    if (!item.separator && !item.disabled) acc.push(i);
    return acc;
  }, []);

  // Convert selectedIndex (among selectable items) to actual index in items array
  const getActualIndex = (selectableIdx: number) => selectableIndices[selectableIdx] ?? 0;
  const getSelectableIndex = (actualIdx: number) => selectableIndices.indexOf(actualIdx);

  // D-05: Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, selectableItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Home':
        e.preventDefault();
        setSelectedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setSelectedIndex(selectableItems.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (selectableItems[selectedIndex]) {
          selectableItems[selectedIndex].action();
          setIsOpen(false);
          // Restore focus to trigger
          triggerRef.current?.focus();
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        // Restore focus to trigger
        triggerRef.current?.focus();
        break;
      default:
        // Type-ahead search (D-05)
        if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
          if (typeaheadTimeout.current) clearTimeout(typeaheadTimeout.current);
          typeaheadBuffer.current += e.key.toLowerCase();
          const matchIdx = selectableItems.findIndex(item =>
            item.label.toLowerCase().startsWith(typeaheadBuffer.current)
          );
          if (matchIdx >= 0) setSelectedIndex(matchIdx);
          // Clear buffer after 500ms
          typeaheadTimeout.current = setTimeout(() => {
            typeaheadBuffer.current = '';
          }, 500);
        }
    }
  }, [selectableItems, selectedIndex]);

  // Clear typeahead timeout when dropdown closes or unmounts
  useEffect(() => {
    if (!isOpen && typeaheadTimeout.current) {
      clearTimeout(typeaheadTimeout.current);
      typeaheadTimeout.current = null;
      typeaheadBuffer.current = '';
    }
    return () => {
      if (typeaheadTimeout.current) clearTimeout(typeaheadTimeout.current);
    };
  }, [isOpen]);

  // WR-01: clear pending typeahead timer when items prop changes so a stale
  // timer cannot fire setSelectedIndex against the new items array.
  useEffect(() => {
    if (typeaheadTimeout.current) {
      clearTimeout(typeaheadTimeout.current);
      typeaheadTimeout.current = null;
      typeaheadBuffer.current = '';
    }
  }, [items]);

  // Focus menu container when opened
  useEffect(() => {
    if (isOpen && menuRef.current) {
      menuRef.current.focus();
    }
  }, [isOpen]);

  // Reset selection when opening
  const handleToggle = useCallback(() => {
    setIsOpen(prev => {
      if (!prev) {
        // Opening - reset selection to first item and compute viewport-relative position
        setSelectedIndex(0);
        if (triggerRef.current) {
          const rect = triggerRef.current.getBoundingClientRect();
          // Phase 20, Plan 05 fix #1: flip menu to align right-edge when
          // a left-aligned menu would overflow the viewport. Menu min-width
          // is 160px (see menuRef style); add margin buffer.
          const MENU_MIN_WIDTH = 160;
          const MARGIN = 8;
          const viewportWidth = window.innerWidth;
          let left = rect.left + window.scrollX;
          if (rect.left + MENU_MIN_WIDTH > viewportWidth - MARGIN) {
            // Flip: align menu's right edge with trigger's right edge
            left = Math.max(MARGIN, rect.right - MENU_MIN_WIDTH + window.scrollX);
          }
          setMenuPosition({
            top: rect.bottom + window.scrollY,
            left,
          });
        }
      }
      return !prev;
    });
  }, []);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && !triggerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Track trigger element for focus restoration
  const triggerWithRef = trigger({
    onClick: handleToggle,
    'aria-haspopup': 'menu',
    'aria-expanded': isOpen,
  });

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div ref={(el) => { triggerRef.current = el; }}>
        {triggerWithRef}
      </div>
      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          style={{
            position: 'fixed',
            top: menuPosition.top,
            left: menuPosition.left,
            backgroundColor: colors.bgElevated,
            border: `1px solid ${colors.bgBorder}`,
            borderRadius: radii.lg,
            padding: `${spacing.sm}px 0`,
            zIndex: 1000,
            minWidth: 160,
            outline: 'none',
          }}
        >
          {items.map((item, i) => {
            const selectableIdx = getSelectableIndex(i);
            const isSelected = selectableIdx === selectedIndex;

            if (item.separator) {
              return (
                <div
                  key={i}
                  role="separator"
                  style={{
                    height: 1,
                    backgroundColor: colors.bgBorder,
                    margin: `${spacing.sm}px 0`,
                  }}
                />
              );
            }

            return (
              <div
                key={i}
                role="menuitem"
                data-selected={isSelected ? 'true' : 'false'}
                aria-disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.action();
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
                onMouseEnter={() => {
                  if (!item.disabled && selectableIdx >= 0) {
                    setSelectedIndex(selectableIdx);
                  }
                }}
                style={{
                  padding: `${spacing.lg}px ${spacing['4xl']}px`,
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  color: item.disabled ? colors.textDim : colors.textPrimary,
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xl,
                  backgroundColor: isSelected ? colors.accentMuted : 'transparent',
                }}
              >
                {item.icon && <item.icon size={14} style={{ pointerEvents: 'none' }} />}
                <span style={{ pointerEvents: 'none' }}>{item.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
