import type { AppStatus } from '../types';
import { Playback } from './Playback';
import { StreamRow } from './StreamRow';
import { ServiceRow } from './ServiceRow';
import './ControlColumn.css';

export interface ControlColumnProps {
  status: AppStatus | null;
  onRefresh: () => void | Promise<void>;
}

export function ControlColumn({ status, onRefresh }: ControlColumnProps) {
  // A successful poll lands status !== null, which is our signal that the
  // server is reachable again. ServiceRow uses this to clear its rebooting
  // state after the Pi comes back up.
  const serverReachable = status !== null;
  return (
    <section className="control-column" aria-label="Controls">
      <Playback status={status} onRefresh={onRefresh} />
      <StreamRow status={status} onRefresh={onRefresh} />
      <ServiceRow onRefresh={onRefresh} serverReachable={serverReachable} />
    </section>
  );
}
