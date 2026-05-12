import { useState } from 'react';
import { api } from '../api';
import { useConfirmTap } from '../hooks/useConfirmTap';
import { LogsPanel } from './LogsPanel';
import './ServiceRow.css';

export interface ServiceRowProps {
  onAction: () => void | Promise<void>;
}

export function ServiceRow({ onAction }: ServiceRowProps) {
  const [logsOpen, setLogsOpen] = useState(false);

  const rebootConfirm = useConfirmTap(async () => {
    try { await api.reboot(); }
    catch { /* network drop is expected during reboot */ }
  });

  async function simpleAction(fn: () => Promise<unknown>) {
    try { await fn(); void onAction(); }
    catch { /* surface via status poll */ }
  }

  return (
    <div className="service-row">
      <span className="label">Service</span>
      <div className="service-buttons">
        <button type="button" className="btn-tertiary" onClick={() => simpleAction(api.stop)}>Stop</button>
        <button type="button" className="btn-tertiary" onClick={() => simpleAction(api.play)}>Start</button>
        <button type="button" className="btn-tertiary" onClick={() => simpleAction(api.restart)}>Restart</button>
        <button
          type="button"
          className={`btn-tertiary btn-danger ${rebootConfirm.pending ? 'is-pending' : ''}`}
          onClick={rebootConfirm.fire}
        >
          {rebootConfirm.pending ? 'Tap again to reboot' : 'Reboot Pi'}
        </button>
        <button type="button" className="btn-tertiary" onClick={() => setLogsOpen(true)}>Logs</button>
      </div>
      {logsOpen && <LogsPanel onClose={() => setLogsOpen(false)} />}
    </div>
  );
}
