import { useState } from 'react';
import type { AppStatus } from '../types';
import { api, toMessage } from '../api';
import { useConfirmTap } from '../hooks/useConfirmTap';
import './Presets.css';

export interface PresetsProps {
  status: AppStatus | null;
  onRefresh: () => void | Promise<void>;
}

export function Presets({ status, onRefresh }: PresetsProps) {
  const presets = status?.presets ?? [];
  const active = status?.active ?? null;
  const [adding, setAdding] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function activatePreset(slug: string) {
    setError(null);
    try { await api.setStation(slug); void onRefresh(); }
    catch (err) { setError(toMessage(err)); }
  }

  async function addPreset() {
    if (!newSlug.trim()) return;
    setError(null);
    try {
      await api.addPreset(newSlug.trim(), newLabel.trim() || newSlug.trim());
      setNewSlug('');
      setNewLabel('');
      setAdding(false);
      void onRefresh();
    } catch (err) { setError(toMessage(err)); }
  }

  return (
    <div className="presets">
      <div className="presets-header">
        <span className="label">Presets</span>
        <button
          type="button"
          className="presets-add-toggle"
          onClick={() => setAdding(!adding)}
        >
          {adding ? '×' : '+'}
        </button>
      </div>
      <div className="preset-chips" role="list">
        {presets.length === 0 && <span className="preset-empty mono">No presets yet</span>}
        {presets.map((p) => (
          <PresetChip
            key={p.slug}
            label={p.label}
            slug={p.slug}
            isActive={p.slug === active}
            onActivate={() => activatePreset(p.slug)}
            onRefresh={onRefresh}
            onError={setError}
          />
        ))}
      </div>
      {adding && (
        <div className="preset-add-form">
          <input
            type="text"
            placeholder="slug (e.g. nosara-pirate-radio)"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
          />
          <input
            type="text"
            placeholder="label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <button type="button" className="btn-apply" onClick={addPreset}>Add</button>
        </div>
      )}
      {error && <div className="presets-error mono">{error}</div>}
    </div>
  );
}

interface PresetChipProps {
  label: string;
  slug: string;
  isActive: boolean;
  onActivate: () => void;
  onRefresh: () => void | Promise<void>;
  onError: (msg: string) => void;
}

function PresetChip({ label, slug, isActive, onActivate, onRefresh, onError }: PresetChipProps) {
  const { pending, fire } = useConfirmTap(async () => {
    try { await api.deletePreset(slug); void onRefresh(); }
    catch (err) { onError(toMessage(err)); }
  });

  return (
    <div className={`preset-chip ${isActive ? 'is-active' : ''}`} role="listitem">
      <button type="button" className="preset-chip-label" onClick={onActivate}>
        {label}
      </button>
      <button
        type="button"
        className={`preset-chip-delete ${pending ? 'is-pending' : ''}`}
        onClick={fire}
        aria-label={pending ? `Tap again to delete ${label}` : `Delete ${label}`}
      >
        {pending ? '✓?' : '×'}
      </button>
    </div>
  );
}
