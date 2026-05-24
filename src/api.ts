import type { AppStatus, AudioState, StationData } from './types';

export interface ApiError extends Error {
  status: number;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof Error
    && typeof (err as { status?: unknown }).status === 'number';
}

export function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

// Stampede guard: when many in-flight requests resolve with 401 in the same
// tick (1Hz status poll + a user action), only the first one navigates. The
// rest still throw so callers' catch paths fire, but they don't redo the
// page-level redirect that's already in progress.
let authRedirecting = false;

export function _resetAuthRedirectingForTests(): void {
  authRedirecting = false;
}

function handleAuthRequired(): void {
  if (authRedirecting) return;
  authRedirecting = true;
  const here = window.location.pathname + window.location.search + window.location.hash;
  window.location.href = `/login?return=${encodeURIComponent(here)}`;
}

async function buildRequest(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const init: RequestInit = {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(path, init);
  if (res.status === 401) {
    handleAuthRequired();
    const err = new Error('auth required') as ApiError;
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (data && typeof data.error === 'string') message = data.error;
    } catch {
      /* non-JSON response */
    }
    const err = new Error(message) as ApiError;
    err.status = res.status;
    throw err;
  }
  return res;
}

async function requestJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await buildRequest(method, path, body);
  return (await res.json()) as T;
}

async function requestText(method: string, path: string): Promise<string> {
  const res = await buildRequest(method, path);
  return res.text();
}

export const api = {
  getStatus: () => requestJson<AppStatus>('GET', '/api/status'),
  play: () => requestJson<{ ok: true }>('POST', '/api/play'),
  pause: () => requestJson<{ ok: true }>('POST', '/api/pause'),
  stop: () => requestJson<{ ok: true }>('POST', '/api/stop'),
  restart: () => requestJson<{ ok: true }>('POST', '/api/restart'),
  reboot: () => requestJson<{ ok: true; message: string }>('POST', '/api/reboot'),
  setVolume: (percent: number) =>
    requestJson<AudioState>('PUT', '/api/volume', { percent }),
  setMuted: (muted: boolean) =>
    requestJson<AudioState>('PUT', '/api/mute', { muted }),
  setStation: (input: string) =>
    requestJson<{ ok: true; station: StationData }>('PUT', '/api/station', { input }),
  getLogs: (lines = 200) => requestText('GET', `/api/logs?lines=${lines}`),
};
