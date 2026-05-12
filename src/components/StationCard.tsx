import type { StationData } from '../types';
import './StationCard.css';

export interface StationCardProps {
  station: StationData | null;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function StationCard({ station }: StationCardProps) {
  if (!station || station.kind === null) {
    return (
      <div className="station-card station-empty">
        <div className="station-art station-art-placeholder">
          <img src="/skull.svg" alt="" aria-hidden="true" />
        </div>
        <div className="station-meta">
          <div className="label">Station</div>
          <div className="station-name">Not configured</div>
        </div>
      </div>
    );
  }

  const isMedia = station.kind === 'media';

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
        <div className="label">{isMedia ? 'Direct stream' : 'Station'}</div>
        <div className="station-name">{station.name || station.slug || 'Unknown'}</div>
        {!isMedia && (
          <div className="station-pills">
            {station.online !== null && (
              <span className={`pill ${station.online ? 'pill-on' : 'pill-off'} mono`}>
                {station.online ? 'On air' : 'Off air'}
              </span>
            )}
            {station.listeners !== null && station.online && (
              <span className="pill pill-soft mono" aria-label="Listener count">
                {station.listeners} listening
              </span>
            )}
          </div>
        )}
        {!isMedia && station.host && (
          <div className="station-host mono">Host · {station.host}</div>
        )}
        {!isMedia && (
          <div className="station-freshness mono">
            {station.apiReachable
              ? <>Synced · {relativeTime(station.fetchedAt)}</>
              : <>API stale · {relativeTime(station.fetchedAt)}</>}
          </div>
        )}
      </div>
    </div>
  );
}
