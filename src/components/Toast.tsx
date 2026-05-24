import { useEffect } from 'react';
import './Toast.css';

const DISMISS_MS = 5000;

export interface ToastProps {
  message: string;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  // Auto-dismiss after DISMISS_MS
  useEffect(() => {
    const t = setTimeout(onDismiss, DISMISS_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="toast" role="alert" aria-live="assertive">
      <span className="toast-dot" aria-hidden="true" />
      <span className="toast-message mono">{message}</span>
      <button
        type="button"
        className="toast-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
