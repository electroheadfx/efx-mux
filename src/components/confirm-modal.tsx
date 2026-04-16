// components/confirm-modal.tsx -- Unsaved changes confirmation modal
// Built per D-11, UI-SPEC ConfirmModal component

import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { colors, fonts, radii, spacing } from '../tokens';

// ── Modal State ───────────────────────────────────────────────────────────────

interface ConfirmModalState {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  onSave?: () => void;
  confirmLabel?: string;
}

const modalState = signal<ConfirmModalState>({
  visible: false,
  title: '',
  message: '',
  onConfirm: () => {},
  onCancel: () => {},
  onSave: undefined,
});

// ── Public API ────────────────────────────────────────────────────────────────

export interface ShowConfirmModalOptions {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  onSave?: () => void;
  confirmLabel?: string;
}

/**
 * Opens the confirmation modal.
 */
export function showConfirmModal(opts: ShowConfirmModalOptions): void {
  modalState.value = { visible: true, ...opts };
}

// ── Component ─────────────────────────────────────────────────────────────────

function hide() {
  modalState.value = { ...modalState.value, visible: false };
}

export function ConfirmModal() {
  // Escape key handler
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && modalState.value.visible) {
        e.preventDefault();
        modalState.value.onCancel();
        hide();
      }
      if (e.key === 'Enter' && modalState.value.visible) {
        e.preventDefault();
        if (modalState.value.onSave) {
          modalState.value.onSave();
        } else {
          modalState.value.onConfirm();
        }
        hide();
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  if (!modalState.value.visible) return null;

  const { title, message, onConfirm, onCancel, onSave, confirmLabel } = modalState.value;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={() => {
        onCancel();
        hide();
      }}
    >
      <div
        style={{
          width: 340,
          backgroundColor: colors.bgElevated,
          border: `1px solid ${colors.bgBorder}`,
          borderRadius: radii.xl,
          padding: spacing['5xl'],
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Title */}
        <div
          style={{
            fontSize: 16,
            fontWeight: 500,
            fontFamily: fonts.sans,
            color: colors.textPrimary,
            marginBottom: spacing.xl,
          }}
        >
          {title}
        </div>

        {/* Body */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 400,
            fontFamily: fonts.sans,
            color: colors.textMuted,
            marginBottom: spacing['4xl'],
          }}
        >
          {message}
        </div>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            gap: spacing['3xl'],
            justifyContent: 'flex-end',
          }}
        >
          {/* Cancel */}
          <button
            onClick={() => {
              onCancel();
              hide();
            }}
            style={{
              borderRadius: radii.xl,
              border: `1px solid ${colors.bgSurface}`,
              padding: '8px 16px',
              fontSize: 13,
              fontFamily: fonts.sans,
              color: colors.textMuted,
              backgroundColor: 'transparent',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          {/* Discard */}
          <button
            onClick={() => {
              onConfirm();
              hide();
            }}
            style={{
              borderRadius: radii.xl,
              backgroundColor: colors.diffRed,
              border: 'none',
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: fonts.sans,
              color: 'white',
              cursor: 'pointer',
            }}
          >
            {confirmLabel ?? 'Discard'}
          </button>

          {/* Save File (only if onSave is provided) */}
          {onSave && (
            <button
              onClick={() => {
                onSave();
                hide();
              }}
              style={{
                borderRadius: radii.xl,
                backgroundColor: colors.accent,
                border: 'none',
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: fonts.sans,
                color: 'white',
                cursor: 'pointer',
              }}
            >
              Save File
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
