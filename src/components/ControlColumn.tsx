import type { AppStatus } from '../types';
import { Playback } from './Playback';
import { StreamRow } from './StreamRow';
import { Presets } from './Presets';
import { ServiceRow } from './ServiceRow';
import './ControlColumn.css';

export interface ControlColumnProps {
  status: AppStatus | null;
  onAction: () => void | Promise<void>;
}

export function ControlColumn({ status, onAction }: ControlColumnProps) {
  return (
    <section className="control-column" aria-label="Controls">
      <Playback status={status} onAction={onAction} />
      <StreamRow status={status} onAction={onAction} />
      <Presets status={status} onAction={onAction} />
      <ServiceRow onAction={onAction} />
    </section>
  );
}
