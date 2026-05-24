import type { AppStatus } from '../types';
import { StationCard } from './StationCard';
import { LevelMeter } from './LevelMeter';
import { StatusIndicator } from './StatusIndicator';
import './MonitorColumn.css';

export interface MonitorColumnProps {
  status: AppStatus | null;
}

function streamTail(raw: string): string {
  // Show the last 12 chars of the URL's pathname, but never crash the panel
  // on a malformed URL — fall back to the raw string's tail.
  try {
    return new URL(raw).pathname.slice(-12);
  } catch {
    return raw.slice(-12);
  }
}

export function MonitorColumn({ status }: MonitorColumnProps) {
  const station = status?.station ?? null;
  const bridgeStatus = status?.bridge.status ?? null;
  const bridgeErrorMessage = status?.bridge.errorMessage ?? null;
  const streamUrl = station?.streamUrl ?? null;
  const meterActive = bridgeStatus === 'playing' || bridgeStatus === 'connecting';

  return (
    <section className="monitor-column" aria-label="Monitor">
      <StationCard station={station} />
      <LevelMeter streamUrl={streamUrl} active={meterActive} />
      <div className="monitor-footer">
        <StatusIndicator status={bridgeStatus} errorMessage={bridgeErrorMessage} />
        {status?.bridge.streamUrl && (
          <span className="stream-source mono" title={status.bridge.streamUrl}>
            {streamTail(status.bridge.streamUrl)}
          </span>
        )}
      </div>
    </section>
  );
}
