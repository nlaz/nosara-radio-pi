import { useEffect, useRef, useState } from 'react';
import { useLevelMeter } from '../hooks/useLevelMeter';
import './LevelMeter.css';

export interface LevelMeterProps {
  streamUrl: string | null;
  /** Whether the meter should actively run. */
  active: boolean;
}

export function LevelMeter({ streamUrl, active }: LevelMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const { error, supported, start } = useLevelMeter(canvasRef, streamUrl, active && started);

  useEffect(() => {
    // Once started, no need to re-listen on every status poll re-render.
    if (started) return;
    // First user gesture anywhere on the page unlocks the AudioContext.
    const onGesture = () => {
      setStarted(true);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
    window.addEventListener('pointerdown', onGesture, { once: true });
    window.addEventListener('keydown', onGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [started]);

  return (
    <div className="level-meter">
      <div className="level-meter-labels">
        <span className="label">Levels</span>
        <span className="mono level-meter-channels">L · R</span>
      </div>
      <canvas
        ref={canvasRef}
        className="level-meter-canvas"
        width={400}
        height={56}
        aria-label="Live audio level meter"
      />
      {!supported && (
        <div className="level-meter-note mono">Web Audio not supported in this browser</div>
      )}
      {supported && !started && active && (
        <button type="button" className="level-meter-start" onClick={() => { setStarted(true); start(); }}>
          Tap to enable meter
        </button>
      )}
      {error && <div className="level-meter-error mono">{error}</div>}
    </div>
  );
}
