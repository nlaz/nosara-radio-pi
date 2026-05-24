import type { StationData } from '../types';
import './StationCard.css';

export interface StationCardProps {
  station: StationData | null;
}

export function StationCard({ station }: StationCardProps) {
  if (!station || station.kind === null) {
    return (
      <div className="station-card station-empty">
        <div className="station-art station-art-placeholder">
          <img src="/skull.svg" alt="" aria-hidden="true" />
        </div>
        <div className="station-meta">
          <div className="station-name">Not configured</div>
        </div>
      </div>
    );
  }

  const isMedia = station.kind === 'media';

  let statusEl: React.ReactNode = null;
  if (!isMedia) {
    if (station.online === true) {
      const listenerSuffix =
        station.listeners !== null ? ` · ${station.listeners} listening` : '';
      statusEl = (
        <span className="station-status">
          <span className="station-status-dot is-on" />
          {`On air${listenerSuffix}`}
        </span>
      );
    } else if (station.online === false) {
      statusEl = (
        <span className="station-status">
          <span className="station-status-dot is-off" />
          Off air
        </span>
      );
    }
  }

  return (
    <div className={`station-card ${isMedia ? 'station-media' : 'station-known'}`}>
      <div className="station-art">
        {station.image ? (
          <img src={station.image} alt={station.name ? `${station.name} artwork` : 'Station artwork'} />
        ) : (
          <div className="station-art-placeholder">
            <img src="/skull.svg" alt="" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="station-meta">
        <div className="station-name">{station.name || station.slug || 'Unknown'}</div>
        {statusEl}
        {!isMedia && station.host && (
          <div className="station-host mono">{station.host}</div>
        )}
      </div>
    </div>
  );
}
