// toast.test.tsx -- Tests for Toast component (Phase 16)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';

describe('Toast', () => {
  // Use dynamic import to get a fresh module with reset signals for each test
  let ToastContainer: typeof import('./toast').ToastContainer;
  let showToast: typeof import('./toast').showToast;
  let dismissToast: typeof import('./toast').dismissToast;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset module to clear signal state
    vi.resetModules();

    // Re-import the component to get fresh signals
    const module = await import('./toast');
    ToastContainer = module.ToastContainer;
    showToast = module.showToast;
    dismissToast = module.dismissToast;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('should render success toast with CheckCircle icon', async () => {
    render(<ToastContainer />);

    showToast({ type: 'success', message: 'Operation successful' });

    await waitFor(() => {
      expect(screen.getByText('Operation successful')).toBeTruthy();
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  it('should render error toast with XCircle icon', async () => {
    render(<ToastContainer />);

    showToast({ type: 'error', message: 'Operation failed' });

    await waitFor(() => {
      expect(screen.getByText('Operation failed')).toBeTruthy();
    });
  });

  it('should display hint text when provided', async () => {
    render(<ToastContainer />);

    showToast({ type: 'error', message: 'Auth failed', hint: 'Run: ssh-add' });

    await waitFor(() => {
      expect(screen.getByText('Auth failed')).toBeTruthy();
      expect(screen.getByText('Run: ssh-add')).toBeTruthy();
    });
  });

  it('should auto-dismiss after 4000ms', async () => {
    render(<ToastContainer />);

    showToast({ type: 'success', message: 'Will disappear' });

    await waitFor(() => {
      expect(screen.getByText('Will disappear')).toBeTruthy();
    });

    // Fast-forward time
    vi.advanceTimersByTime(4000);

    await waitFor(() => {
      expect(screen.queryByText('Will disappear')).toBeNull();
    });
  });

  it('should dismiss immediately on X click', async () => {
    render(<ToastContainer />);

    showToast({ type: 'success', message: 'Click to dismiss' });

    await waitFor(() => {
      expect(screen.getByText('Click to dismiss')).toBeTruthy();
    });

    const dismissBtn = screen.getByLabelText('Dismiss');
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByText('Click to dismiss')).toBeNull();
    });
  });

  it('should stack multiple toasts', async () => {
    render(<ToastContainer />);

    showToast({ type: 'success', message: 'First toast' });
    showToast({ type: 'error', message: 'Second toast' });

    await waitFor(() => {
      expect(screen.getByText('First toast')).toBeTruthy();
      expect(screen.getByText('Second toast')).toBeTruthy();
    });
  });
});
