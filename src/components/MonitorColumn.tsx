import type { AppStatus } from '../types';
import { StationCard } from './StationCard';
import { LevelMeter } from './LevelMeter';
import { StatusIndicator } from './StatusIndicator';
import './MonitorColumn.css';

export interface MonitorColumnProps {
  status: AppStatus | null;
}

export function MonitorColumn({ status }: MonitorColumnProps) {
  const station = status?.station ?? null;
  const bridgeStatus = status?.bridge.status ?? null;
  const streamUrl = station?.streamUrl ?? null;
  const meterActive = bridgeStatus === 'playing' || bridgeStatus === 'connecting';

  return (
    <section className="monitor-column" aria-label="Monitor">
      <StationCard station={station} />
      <LevelMeter streamUrl={streamUrl} active={meterActive} />
      <div className="monitor-footer">
        <StatusIndicator status={bridgeStatus} />
        {status?.bridge.streamUrl && (
          <span className="stream-source mono" title={status.bridge.streamUrl}>
            {new URL(status.bridge.streamUrl).pathname.slice(-12)}
          </span>
        )}
      </div>
    </section>
  );
}
