import type { AppStatus } from '../types';

export interface MonitorColumnProps {
  status: AppStatus | null;
}

export function MonitorColumn({ status }: MonitorColumnProps) {
  // Full implementation lands in U6 — StationCard, LevelMeter, StatusIndicator.
  return (
    <section className="monitor-column" aria-label="Monitor">
      <div className="placeholder mono">
        Monitor placeholder · bridge: {status?.bridge.status ?? '—'}
      </div>
    </section>
  );
}
