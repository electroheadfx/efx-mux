// toast.tsx -- Toast notification component (Phase 16, D-15, D-16)
//
// Provides success/error toasts for git operations.
// Auto-dismisses after 4000ms or on X click.

import { signal } from '@preact/signals';
import { colors, fonts, spacing, radii } from '../tokens';
import { CheckCircle, XCircle, X } from 'lucide-preact';

interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
  hint?: string;
}

const toasts = signal<Toast[]>([]);

/**
 * Show a toast notification.
 * @param toast Toast data (type, message, optional hint)
 */
export function showToast(toast: Omit<Toast, 'id'>): void {
  const id = Date.now().toString();
  toasts.value = [...toasts.value, { ...toast, id }];

  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 4000);
}

/**
 * Dismiss a toast immediately.
 * @param id Toast ID to dismiss
 */
export function dismissToast(id: string): void {
  toasts.value = toasts.value.filter(t => t.id !== id);
}

function ToastItem({ toast }: { toast: Toast }) {
  const isError = toast.type === 'error';

  return (
    <div
      role="alert"
      style={{
        backgroundColor: colors.bgElevated,
        border: `1px solid ${isError ? colors.diffRed : colors.statusGreen}`,
        borderRadius: radii.lg,
        padding: `${spacing['3xl']}px ${spacing['4xl']}px`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: spacing.xl,
        width: 280,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      {isError ? (
        <XCircle size={16} style={{ color: colors.diffRed, flexShrink: 0, marginTop: 2 }} />
      ) : (
        <CheckCircle size={16} style={{ color: colors.statusGreen, flexShrink: 0, marginTop: 2 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 12,
            color: colors.textPrimary,
            lineHeight: 1.4,
          }}
        >
          {toast.message}
        </div>
        {toast.hint && (
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 11,
              color: colors.textMuted,
              marginTop: spacing.md,
            }}
          >
            {toast.hint}
          </div>
        )}
      </div>
      <button
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss"
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: colors.textDim,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * Toast container component. Mount once in app root.
 */
export function ToastContainer() {
  if (toasts.value.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: spacing['4xl'],
        right: spacing['4xl'],
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xl,
      }}
    >
      {toasts.value.map(toast => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
