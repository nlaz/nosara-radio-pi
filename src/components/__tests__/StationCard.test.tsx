import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StationCard } from '../StationCard';
import type { StationData } from '../../types';

const baseStation: StationData = {
  slug: 'nosara-pirate-radio',
  kind: 'station',
  streamUrl: 'https://media.evenings.co/s/elkVE8rA8',
  name: 'Nosara Pirate Radio',
  image: 'https://example.com/art.jpg',
  host: null,
  online: true,
  listeners: 3,
  fetchedAt: new Date().toISOString(),
  apiReachable: true,
};

describe('StationCard', () => {
  test('U6.T1: renders artwork, name, listener count, and on-air pill', () => {
    render(<StationCard station={baseStation} />);
    expect(screen.getByText('Nosara Pirate Radio')).toBeInTheDocument();
    expect(screen.getByText('On air')).toBeInTheDocument();
    expect(screen.getByText('3 listening')).toBeInTheDocument();
    const img = screen.getByRole('img', { name: /artwork/i }) as HTMLImageElement;
    expect(img.src).toBe('https://example.com/art.jpg');
  });

  test('U6.T1b: omits listener pill when station is off-air', () => {
    render(<StationCard station={{ ...baseStation, online: false }} />);
    expect(screen.getByText('Off air')).toBeInTheDocument();
    expect(screen.queryByText(/listening/)).not.toBeInTheDocument();
  });

  test('U6.T2: media-kind station shows Direct stream label and no pills', () => {
    const media: StationData = {
      ...baseStation, kind: 'media', name: null, image: null,
      host: null, online: null, listeners: null,
    };
    render(<StationCard station={media} />);
    expect(screen.getByText('Direct stream')).toBeInTheDocument();
    expect(screen.queryByText(/On air|Off air|listening/)).not.toBeInTheDocument();
    expect(screen.getByText('nosara-pirate-radio')).toBeInTheDocument();
  });

  test('U6.T4: apiReachable=false renders "API stale" subline', () => {
    render(<StationCard station={{ ...baseStation, apiReachable: false }} />);
    expect(screen.getByText(/API stale/)).toBeInTheDocument();
  });

  test('renders host when set', () => {
    render(<StationCard station={{ ...baseStation, host: 'DJ Whoever' }} />);
    expect(screen.getByText(/Host · DJ Whoever/)).toBeInTheDocument();
  });

  test('renders placeholder when station data is empty', () => {
    render(<StationCard station={null} />);
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });
});
