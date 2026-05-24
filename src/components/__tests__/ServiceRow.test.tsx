import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ServiceRow } from '../ServiceRow';

// Mock the api module
vi.mock('../../api', () => ({
  api: {
    restart: vi.fn().mockResolvedValue({ ok: true }),
    reboot: vi.fn().mockResolvedValue({ ok: true, message: 'rebooting' }),
    stop: vi.fn().mockResolvedValue({ ok: true }),
    play: vi.fn().mockResolvedValue({ ok: true }),
  },
  toMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

// Mock LogsPanel
vi.mock('../LogsPanel', () => ({
  LogsPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="logs-panel">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

import { api } from '../../api';

const noop = () => Promise.resolve();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ServiceRow', () => {
  test('U4.T1: no Stop button is rendered', () => {
    render(<ServiceRow onRefresh={noop} />);
    expect(screen.queryByRole('button', { name: /^stop$/i })).not.toBeInTheDocument();
  });

  test('U4.T2: no Start button is rendered', () => {
    render(<ServiceRow onRefresh={noop} />);
    expect(screen.queryByRole('button', { name: /^start$/i })).not.toBeInTheDocument();
  });

  test('U4.T3: "Restart stream" button calls api.restart', async () => {
    render(<ServiceRow onRefresh={noop} />);
    const btn = screen.getByRole('button', { name: /restart stream/i });
    await act(async () => { fireEvent.click(btn); });
    expect(api.restart).toHaveBeenCalledTimes(1);
  });

  test('U4.T4: "Reboot device" shows confirm state then fires api.reboot on second click', async () => {
    render(<ServiceRow onRefresh={noop} />);

    const rebootBtn = screen.getByRole('button', { name: /reboot device/i });

    // First click enters pending state
    act(() => { fireEvent.click(rebootBtn); });
    expect(screen.getByRole('button', { name: /tap again to reboot/i })).toBeInTheDocument();
    expect(api.reboot).not.toHaveBeenCalled();

    // Second click within the window fires the reboot
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /tap again to reboot/i }));
    });
    expect(api.reboot).toHaveBeenCalledTimes(1);
  });

  test('U4.T5: "Logs" button opens LogsPanel', () => {
    render(<ServiceRow onRefresh={noop} />);
    expect(screen.queryByTestId('logs-panel')).not.toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /logs/i })); });
    expect(screen.getByTestId('logs-panel')).toBeInTheDocument();
  });

  test('U4.T6: all buttons are disabled while rebooting', async () => {
    render(<ServiceRow onRefresh={noop} />);

    // Trigger reboot (two taps)
    act(() => { fireEvent.click(screen.getByRole('button', { name: /reboot device/i })); });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /tap again to reboot/i }));
    });

    // After reboot fires, rebooting state is true — all buttons should be disabled
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });
});
