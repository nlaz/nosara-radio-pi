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
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const s = status ?? 'stopped';
  return (
    <div className={`status-indicator status-${s}`} role="status" aria-live="polite">
      <span className="status-dot" aria-hidden="true" />
      <span className="status-label mono">{LABELS[s]}</span>
    </div>
  );
}
