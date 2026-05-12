import { useEffect, useState } from 'react';
import type { AppStatus } from '../types';
import { api } from '../api';
import './Playback.css';

export interface PlaybackProps {
  status: AppStatus | null;
  onRefresh: () => void | Promise<void>;
}

export function Playback({ status, onRefresh }: PlaybackProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const bridgeStatus = status?.bridge.status ?? null;
  const audio = status?.audio ?? { percent: null, muted: null, error: null };

  const isPlaying = bridgeStatus === 'playing' || bridgeStatus === 'connecting';

  // Local slider state allows dragging without firing requests every tick;
  // we commit on pointer release. Sync with server when not actively dragging
  // and not mid-commit — otherwise an in-flight setVolume could be clobbered
  // by a stale poll result.
  const [draft, setDraft] = useState<number>(audio.percent ?? 80);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging && busy !== 'volume' && audio.percent !== null) setDraft(audio.percent);
  }, [audio.percent, dragging, busy]);

  async function togglePlayPause() {
    setBusy('play');
    try {
      if (isPlaying) await api.pause();
      else await api.play();
    } finally {
      setBusy(null);
      void onRefresh();
    }
  }

  async function commitVolume(value: number) {
    setBusy('volume');
    try { await api.setVolume(value); }
    finally { setBusy(null); void onRefresh(); }
  }

  async function toggleMute() {
    if (audio.muted === null) return;
    setBusy('mute');
    try { await api.setMuted(!audio.muted); }
    finally { setBusy(null); void onRefresh(); }
  }

  return (
    <div className="playback">
      <div className="playback-row">
        <button
          type="button"
          className={`btn-primary btn-play ${isPlaying ? 'is-on' : ''}`}
          onClick={togglePlayPause}
          disabled={busy === 'play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button
          type="button"
          className={`btn-secondary ${audio.muted ? 'is-on' : ''}`}
          onClick={toggleMute}
          disabled={busy === 'mute' || audio.muted === null}
          aria-pressed={audio.muted ?? false}
          aria-label={audio.muted ? 'Unmute' : 'Mute'}
        >
          {audio.muted ? '🔇 Unmute' : '🔊 Mute'}
        </button>
      </div>
      <div className="volume-row">
        <span className="label">Volume</span>
        <input
          type="range" min={0} max={100} step={1}
          value={draft}
          disabled={audio.percent === null}
          onChange={(e) => { setDragging(true); setDraft(Number(e.target.value)); }}
          onMouseUp={() => { if (dragging) { void commitVolume(draft); setDragging(false); } }}
          onTouchEnd={() => { if (dragging) { void commitVolume(draft); setDragging(false); } }}
          onKeyDown={() => { setDragging(true); }}
          onKeyUp={() => { if (dragging) { void commitVolume(draft); setDragging(false); } }}
          className="volume-slider"
          aria-label="Speaker volume"
        />
        <span className="mono volume-value">{draft.toString().padStart(3, ' ')}%</span>
      </div>
      {audio.error && <div className="audio-error mono">Audio: {audio.error}</div>}
    </div>
  );
}
