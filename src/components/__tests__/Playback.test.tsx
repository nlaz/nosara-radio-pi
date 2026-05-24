import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Playback } from '../Playback';
import type { AppStatus } from '../../types';

vi.mock('../api');

const baseStatus: AppStatus = {
  bridge: { status: 'stopped', errorMessage: null, streamUrl: null },
  station: {
    slug: 'test-station',
    kind: 'station',
    streamUrl: 'https://example.com/stream',
    name: 'Test Station',
    image: null,
    host: null,
    online: true,
    listeners: 0,
    fetchedAt: new Date().toISOString(),
    apiReachable: true,
  },
  audio: { percent: 80, muted: false, error: null },
  active: 'test-station',
  presets: [],
};

describe('Playback', () => {
  test('U5.T1: Play button has label "Play" (no ▶ prefix) when stopped', () => {
    render(<Playback status={baseStatus} onRefresh={() => {}} />);
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
    expect(screen.queryByText(/▶/)).not.toBeInTheDocument();
  });

  test('U5.T2: Pause button has label "Pause" (no ❚❚ prefix) when playing', () => {
    const playing: AppStatus = { ...baseStatus, bridge: { status: 'playing', errorMessage: null, streamUrl: null } };
    render(<Playback status={playing} onRefresh={() => {}} />);
    expect(screen.getByRole('button', { name: /^pause$/i })).toBeInTheDocument();
    expect(screen.queryByText(/❚❚/)).not.toBeInTheDocument();
  });

  test('U5.T3: Mute button has label "Mute" (no 🔊 prefix) when not muted', () => {
    render(<Playback status={baseStatus} onRefresh={() => {}} />);
    expect(screen.getByRole('button', { name: /^mute$/i })).toBeInTheDocument();
    expect(screen.queryByText(/🔊/)).not.toBeInTheDocument();
  });

  test('U5.T4: Unmute button has label "Unmute" (no 🔇 prefix) when muted', () => {
    const muted: AppStatus = { ...baseStatus, audio: { ...baseStatus.audio, muted: true } };
    render(<Playback status={muted} onRefresh={() => {}} />);
    expect(screen.getByRole('button', { name: /^unmute$/i })).toBeInTheDocument();
    expect(screen.queryByText(/🔇/)).not.toBeInTheDocument();
  });

  test('U5.T5: volume slider has --p set to "80%" when audio.percent is 80', () => {
    render(<Playback status={baseStatus} onRefresh={() => {}} />);
    const slider = screen.getByRole('slider', { name: /speaker volume/i }) as HTMLInputElement;
    expect(slider.style.getPropertyValue('--p')).toBe('80%');
  });

  test('U5.T6: volume slider has --p set to "0%" when audio.percent is 0', () => {
    const zeroVol: AppStatus = { ...baseStatus, audio: { ...baseStatus.audio, percent: 0 } };
    render(<Playback status={zeroVol} onRefresh={() => {}} />);
    const slider = screen.getByRole('slider', { name: /speaker volume/i }) as HTMLInputElement;
    expect(slider.style.getPropertyValue('--p')).toBe('0%');
  });
});
