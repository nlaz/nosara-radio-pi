import { useEffect, useRef, useState, type RefObject } from 'react';
import { toMessage } from '../api';

interface ChannelLevel {
  peak: number;       // 0..1
  rms: number;        // 0..1
  peakDb: number;     // dB
}

export interface UseLevelMeterResult {
  error: string | null;
  supported: boolean;
  start: () => void;
}

type LevelBuffer = Float32Array<ArrayBuffer>;

interface MeterContext {
  audio: HTMLAudioElement;
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  splitter: ChannelSplitterNode;
  analysers: [AnalyserNode, AnalyserNode];
  buffers: [LevelBuffer, LevelBuffer];
}

function dB(value: number): number {
  if (value <= 0.0001) return -80;
  return Math.max(-80, 20 * Math.log10(value));
}

/**
 * Drives a canvas-based stereo level meter from a stream URL.
 * The browser fetches the same streamUrl muted; audio plays on the Pi,
 * the browser only analyses the bytes for visualization.
 *
 * Returns start() so the meter can be initialized after a user gesture
 * (some browsers suspend AudioContext until first interaction).
 */
export function useLevelMeter(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  streamUrl: string | null,
  enabled: boolean,
): UseLevelMeterResult {
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean>(true);
  const meterRef = useRef<MeterContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const peakRef = useRef<[number, number]>([0, 0]);

  const tearDown = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const m = meterRef.current;
    if (m) {
      try { m.audio.pause(); } catch { /* ignore */ }
      try { m.audio.src = ''; } catch { /* ignore */ }
      try { m.ctx.close(); } catch { /* ignore */ }
    }
    meterRef.current = null;
    peakRef.current = [0, 0];
  };

  const drawIdle = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const setup = () => {
    if (!enabled || !streamUrl || !canvasRef.current) return;
    const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) {
      setSupported(false);
      setError('Web Audio not supported');
      return;
    }
    try {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.muted = true;
      audio.preload = 'auto';
      audio.src = streamUrl;
      void audio.play().catch((err: unknown) => {
        // AbortError means tearDown() called audio.pause() before play() resolved
        // (e.g. streamUrl changed or component unmounted). That's expected — ignore it.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(`Audio fetch blocked: ${toMessage(err)}`);
      });

      const audioCtx = new Ctor();
      const source = audioCtx.createMediaElementSource(audio);
      const splitter = audioCtx.createChannelSplitter(2);
      const analyserL = audioCtx.createAnalyser();
      const analyserR = audioCtx.createAnalyser();
      for (const a of [analyserL, analyserR]) {
        a.fftSize = 1024;
        a.smoothingTimeConstant = 0;
      }
      source.connect(splitter);
      splitter.connect(analyserL, 0);
      splitter.connect(analyserR, 1);
      // Don't connect analysers to destination — Pi plays the audio,
      // not the browser. crossOrigin + muted keeps the element silent.

      const bufL = new Float32Array(new ArrayBuffer(analyserL.fftSize * Float32Array.BYTES_PER_ELEMENT));
      const bufR = new Float32Array(new ArrayBuffer(analyserR.fftSize * Float32Array.BYTES_PER_ELEMENT));
      meterRef.current = {
        audio, ctx: audioCtx, source, splitter,
        analysers: [analyserL, analyserR],
        buffers: [bufL, bufR],
      };
      setError(null);
      loop();
    } catch (err) {
      setError(toMessage(err));
    }
  };

  const computeChannel = (analyser: AnalyserNode, buf: LevelBuffer): ChannelLevel => {
    analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    let sumSquares = 0;
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
      sumSquares += buf[i] * buf[i];
    }
    const rms = Math.sqrt(sumSquares / buf.length);
    return { peak, rms, peakDb: dB(peak) };
  };

  const draw = (l: ChannelLevel, r: ChannelLevel) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const gap = 6;
    const barH = (h - gap) / 2;

    ctx.clearRect(0, 0, w, h);

    // Track background
    ctx.fillStyle = 'rgba(7, 45, 68, 0.08)';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillRect(0, barH + gap, w, barH);

    const drawBar = (level: ChannelLevel, y: number) => {
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0.0, '#18a2d2');
      grad.addColorStop(0.7, '#1d9bc8');
      grad.addColorStop(0.92, '#e6a23c');
      grad.addColorStop(1.0, '#c44a3b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, Math.min(level.peak, 1) * w, barH);
    };

    drawBar(l, 0);
    drawBar(r, barH + gap);
  };

  const loop = () => {
    const m = meterRef.current;
    if (!m) return;
    const [analyserL, analyserR] = m.analysers;
    const [bufL, bufR] = m.buffers;
    const l = computeChannel(analyserL, bufL);
    const r = computeChannel(analyserR, bufR);

    // Attack instant, release ~95% per frame for a peak-hold feel.
    peakRef.current[0] = l.peak > peakRef.current[0] ? l.peak : peakRef.current[0] * 0.95;
    peakRef.current[1] = r.peak > peakRef.current[1] ? r.peak : peakRef.current[1] * 0.95;

    draw(
      { peak: peakRef.current[0], rms: l.rms, peakDb: dB(peakRef.current[0]) },
      { peak: peakRef.current[1], rms: r.rms, peakDb: dB(peakRef.current[1]) },
    );

    rafRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    if (!enabled) {
      tearDown();
      drawIdle();
      return;
    }
    setup();
    return () => tearDown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamUrl, enabled]);

  return {
    error,
    supported,
    start: () => {
      const m = meterRef.current;
      if (m && m.ctx.state === 'suspended') void m.ctx.resume();
    },
  };
}
