import { useEffect, useState } from 'react';
import { api, toMessage } from '../api';
import './LogsPanel.css';

export interface LogsPanelProps {
  onClose: () => void;
}

export function LogsPanel({ onClose }: LogsPanelProps) {
  const [text, setText] = useState<string>('Loading…');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const t = await api.getLogs(200);
      setText(t);
    } catch (err) {
      setText(`Error fetching logs: ${toMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="logs-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Service logs">
      <div className="logs-panel" onClick={(e) => e.stopPropagation()}>
        <div className="logs-panel-header">
          <span className="label">Recent service logs</span>
          <div className="logs-actions">
            <button type="button" className="btn-tertiary" onClick={load} disabled={busy}>
              {busy ? 'Refreshing…' : 'Refresh'}
            </button>
            <button type="button" className="btn-tertiary" onClick={onClose}>Close</button>
          </div>
        </div>
        <pre className="logs-body mono">{text}</pre>
      </div>
    </div>
  );
}
