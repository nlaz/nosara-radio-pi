import { useEffect, useState } from 'react';
import type { AppStatus } from '../types';
import { StationCard } from './StationCard';
import { LevelMeter } from './LevelMeter';
import { StatusIndicator } from './StatusIndicator';
import './MonitorColumn.css';

// How long meterActive stays true after the bridge stops playing.
// Covers the ~1 s restart cycle so the audio connection isn't torn
// down and re-opened on every restart, which logs ERR_INCOMPLETE_CHUNKED_ENCODING.
const METER_LINGER_MS = 3000;

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

  // Debounced meterActive: turns on immediately when playing/connecting,
  // but waits METER_LINGER_MS before turning off. This prevents the
  // audio element from being torn down and reconnected on every restart.
  const shouldBeActive = bridgeStatus === 'playing' || bridgeStatus === 'connecting';
  const [meterActive, setMeterActive] = useState(shouldBeActive);
  useEffect(() => {
    if (shouldBeActive) {
      setMeterActive(true);
      return;
    }
    const t = setTimeout(() => setMeterActive(false), METER_LINGER_MS);
    return () => clearTimeout(t);
  }, [shouldBeActive]);

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
