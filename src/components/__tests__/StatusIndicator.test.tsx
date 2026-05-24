import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusIndicator } from '../StatusIndicator';
import type { BridgeStatus } from '../../types';

describe('StatusIndicator', () => {
  const cases: Array<[BridgeStatus, string]> = [
    ['playing', 'Playing'],
    ['connecting', 'Connecting'],
    ['stopped', 'Stopped'],
    ['paused', 'Paused'],
    ['error', 'Error'],
  ];

  test.each(cases)('U6.T5: renders %s state with correct label', (state, label) => {
    const { container } = render(<StatusIndicator status={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector(`.status-${state}`)).toBeInTheDocument();
  });

  test('falls back to stopped when status is null', () => {
    const { container } = render(<StatusIndicator status={null} />);
    expect(container.querySelector('.status-stopped')).toBeInTheDocument();
  });

  test('shows errorMessage instead of "Error" when status is error and message is set', () => {
    render(<StatusIndicator status="error" errorMessage="No audio device" />);
    expect(screen.getByText('No audio device')).toBeInTheDocument();
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });

  test('shows generic "Error" when status is error and errorMessage is null', () => {
    render(<StatusIndicator status="error" errorMessage={null} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });
});
