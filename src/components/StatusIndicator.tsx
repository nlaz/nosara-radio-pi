import type { BridgeStatus } from '../types';
import './StatusIndicator.css';

const LABELS: Record<BridgeStatus, string> = {
  playing: 'Playing',
  connecting: 'Connecting',
  stopped: 'Stopped',
  paused: 'Paused',
  error: 'Error',
};

export interface StatusIndicatorProps {
  status: BridgeStatus | null;
  errorMessage?: string | null;
}

export function StatusIndicator({ status, errorMessage }: StatusIndicatorProps) {
  const s = status ?? 'stopped';
  const label = s === 'error' && errorMessage ? errorMessage : LABELS[s];
  return (
    <div className={`status-indicator status-${s}`} role="status" aria-live="polite">
      <span className="status-dot" aria-hidden="true" />
      <span className="status-label mono">{label}</span>
    </div>
  );
}
