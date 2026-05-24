import { useEffect, useState } from 'react';
import { api, toMessage } from '../api';
import { useConfirmTap } from '../hooks/useConfirmTap';
import { LogsPanel } from './LogsPanel';
import './ServiceRow.css';

export interface ServiceRowProps {
  onRefresh: () => void | Promise<void>;
  // If the parent passes the latest status, we use it to detect when the Pi
  // is back after a reboot. When unset, rebooting flag relies on a fixed
  // grace timer instead.
  serverReachable?: boolean;
}

export function ServiceRow({ onRefresh, serverReachable }: ServiceRowProps) {
  const [logsOpen, setLogsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rebooting, setRebooting] = useState(false);

  // Once /api/status starts succeeding again, drop the rebooting state.
  useEffect(() => {
    if (rebooting && serverReachable) setRebooting(false);
  }, [rebooting, serverReachable]);

  const rebootConfirm = useConfirmTap(async () => {
    setError(null);
    setRebooting(true);
    try { await api.reboot(); }
    catch (err) {
      // Network drop is expected during reboot; only surface non-network errs
      const msg = toMessage(err);
      if (!/network|fetch|abort/i.test(msg)) setError(msg);
    }
  });

  async function simpleAction(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); void onRefresh(); }
    catch (err) { setError(toMessage(err)); }
  }

  const disabled = rebooting;

  return (
    <div className="service-row">
      <span className="label">Service</span>
      <div className="service-buttons">
        <button type="button" className="btn-tertiary" disabled={disabled} onClick={() => simpleAction(api.restart)}>Restart stream</button>
        <button
          type="button"
          className={`btn-tertiary btn-danger ${rebootConfirm.pending ? 'is-pending' : ''}`}
          disabled={disabled}
          onClick={rebootConfirm.fire}
        >
          {rebooting ? 'Rebooting…' : rebootConfirm.pending ? 'Tap again to reboot' : 'Reboot device'}
        </button>
        <button type="button" className="btn-tertiary" disabled={disabled} onClick={() => setLogsOpen(true)}>Logs</button>
      </div>
      {error && <div className="service-error mono">{error}</div>}
      {logsOpen && <LogsPanel onClose={() => setLogsOpen(false)} />}
    </div>
  );
}
