import type { AppStatus } from '../types';

export interface ControlColumnProps {
  status: AppStatus | null;
  onAction: () => void | Promise<void>;
}

export function ControlColumn({ status }: ControlColumnProps) {
  // Full implementation lands in U7 — Playback, StreamRow, Presets, ServiceRow, LogsPanel.
  return (
    <section className="control-column" aria-label="Controls">
      <div className="placeholder mono">
        Control placeholder · active: {status?.active ?? '—'}
      </div>
    </section>
  );
}
