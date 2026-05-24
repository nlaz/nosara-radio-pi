import { describe, expect, test, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { App } from '../../App';

// Mock child columns so tests focus on App structure only
vi.mock('../MonitorColumn', () => ({
  MonitorColumn: () => <div data-testid="monitor-column" />,
}));
vi.mock('../ControlColumn', () => ({
  ControlColumn: () => <div data-testid="control-column" />,
}));

// Mock useStatus — default: no error
const mockUseStatus = vi.fn(() => ({ status: null, error: null as string | null, refresh: vi.fn() }));
vi.mock('../../hooks/useStatus', () => ({
  useStatus: () => mockUseStatus(),
}));

describe('App', () => {
  test('U2.T1: renders without a header element', () => {
    render(<App />);
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(document.querySelector('.app-header')).toBeNull();
    expect(document.querySelector('img.app-mark')).toBeNull();
    expect(screen.queryByText('RADIO')).not.toBeInTheDocument();
    expect(screen.queryByText('CONTROL')).not.toBeInTheDocument();
  });

  test('U2.T2: error banner renders above main when useStatus returns an error', () => {
    mockUseStatus.mockReturnValueOnce({ status: null, error: 'connection failed', refresh: vi.fn() });
    render(<App />);
    const banner = screen.getByRole('alert');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('connection failed');
    // Banner must appear before main in the DOM
    const main = screen.getByRole('main');
    expect(banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('U2.T3: error banner is absent when useStatus returns no error', () => {
    render(<App />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('U2.T4: toast appears when bridge status transitions to error', async () => {
    const errorStatus = {
      bridge: { status: 'error' as const, errorMessage: 'No audio device', streamUrl: null },
      station: { slug: null, kind: null, streamUrl: null, name: null, image: null,
        host: null, online: null, listeners: null, fetchedAt: null, apiReachable: true },
      audio: { percent: null, muted: null, error: null },
      active: 'test',
      presets: [],
    };
    mockUseStatus.mockReturnValue({ status: errorStatus, error: null, refresh: vi.fn() });
    await act(async () => { render(<App />); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No audio device');
  });

  test('U2.T5: toast uses generic "Stream error" when errorMessage is null', async () => {
    const errorStatus = {
      bridge: { status: 'error' as const, errorMessage: null, streamUrl: null },
      station: { slug: null, kind: null, streamUrl: null, name: null, image: null,
        host: null, online: null, listeners: null, fetchedAt: null, apiReachable: true },
      audio: { percent: null, muted: null, error: null },
      active: 'test',
      presets: [],
    };
    mockUseStatus.mockReturnValue({ status: errorStatus, error: null, refresh: vi.fn() });
    await act(async () => { render(<App />); });
    expect(screen.getByRole('alert')).toHaveTextContent('Stream error');
  });
});
