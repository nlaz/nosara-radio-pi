import { useEffect, useState } from 'react';
import type { AppStatus } from '../types';
import { api } from '../api';
import './StreamRow.css';

export interface StreamRowProps {
  status: AppStatus | null;
  onAction: () => void | Promise<void>;
}

export function StreamRow({ status, onAction }: StreamRowProps) {
  const active = status?.active ?? '';
  const [input, setInput] = useState(active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setInput(active);
  }, [active, dirty]);

  async function apply() {
    const value = input.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await api.setStation(value);
      setDirty(false);
      void onAction();
    } catch (err) {
      const e = err as { status?: number; message: string };
      if (e.status === 404) setError('Station not found');
      else if (e.status === 400) setError(`Invalid input: ${e.message}`);
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stream-row">
      <label className="label" htmlFor="station-input">Station URL or slug</label>
      <div className="stream-input-row">
        <input
          id="station-input"
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setDirty(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void apply(); }}
          placeholder="evenings.fm/nosara-pirate-radio"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        <button
          type="button"
          className="btn-apply"
          onClick={apply}
          disabled={busy || !input.trim()}
        >
          {busy ? 'Applying…' : 'Apply'}
        </button>
      </div>
      {error && <div className="stream-error mono">{error}</div>}
    </div>
  );
}
