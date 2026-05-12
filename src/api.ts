import type { AppStatus, AudioState, Preset, StationData } from './types';

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (data && typeof data.error === 'string') message = data.error;
    } catch {
      /* non-JSON response */
    }
    throw Object.assign(new Error(message), { status: res.status });
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const api = {
  getStatus: () => request<AppStatus>('GET', '/api/status'),
  play: () => request<{ ok: true }>('POST', '/api/play'),
  pause: () => request<{ ok: true }>('POST', '/api/pause'),
  stop: () => request<{ ok: true }>('POST', '/api/stop'),
  restart: () => request<{ ok: true }>('POST', '/api/restart'),
  reboot: () => request<{ ok: true; message: string }>('POST', '/api/reboot'),
  setVolume: (percent: number) =>
    request<AudioState>('PUT', '/api/volume', { percent }),
  setMuted: (muted: boolean) =>
    request<AudioState>('PUT', '/api/mute', { muted }),
  setStation: (input: string) =>
    request<{ ok: true; station: StationData }>('PUT', '/api/station', { input }),
  listPresets: () => request<Preset[]>('GET', '/api/presets'),
  addPreset: (slug: string, label: string) =>
    request<Preset[]>('POST', '/api/presets', { slug, label }),
  deletePreset: (slug: string) =>
    request<Preset[]>('DELETE', `/api/presets/${encodeURIComponent(slug)}`),
  getLogs: (lines = 200) => request<string>('GET', `/api/logs?lines=${lines}`),
};
