import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { _resetAuthRedirectingForTests, api, isApiError } from '../api';

interface MockLocation {
  href: string;
  pathname: string;
  search: string;
  hash: string;
}

let mockLocation: MockLocation;
let originalLocation: Location;

beforeEach(() => {
  _resetAuthRedirectingForTests();
  originalLocation = window.location;
  mockLocation = {
    href: 'http://localhost/',
    pathname: '/',
    search: '',
    hash: '',
  };
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: mockLocation,
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
  vi.restoreAllMocks();
});

function mockFetchOnce(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' },
    }),
  );
}

function mockFetchAlways(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' },
    }),
  );
}

describe('U4: api 401 handling + stampede guard', () => {
  test('U4.A1: 200 response does not touch window.location', async () => {
    mockFetchOnce(200, { ok: true });
    await api.play();
    expect(mockLocation.href).toBe('http://localhost/');
  });

  test('U4.A2: 401 response navigates to /login?return=<encoded path>', async () => {
    mockLocation.pathname = '/presets';
    mockLocation.search = '?q=x';
    mockFetchOnce(401, { error: 'auth required' });
    await expect(api.getStatus()).rejects.toMatchObject({ status: 401 });
    expect(mockLocation.href).toBe('/login?return=' + encodeURIComponent('/presets?q=x'));
  });

  test('U4.A3: ApiError thrown after 401 has status 401', async () => {
    mockFetchOnce(401, { error: 'auth required' });
    try {
      await api.getStatus();
      expect.unreachable();
    } catch (err) {
      expect(isApiError(err)).toBe(true);
      if (isApiError(err)) expect(err.status).toBe(401);
    }
  });

  test('U4.A4: two concurrent 401s only navigate once (stampede guard)', async () => {
    mockFetchAlways(401, { error: 'auth required' });
    const navigations: string[] = [];
    // Trap assignments to href into a captured list.
    Object.defineProperty(mockLocation, 'href', {
      get() { return 'http://localhost/'; },
      set(v: string) { navigations.push(v); },
      configurable: true,
    });

    const results = await Promise.allSettled([
      api.getStatus(),
      api.play(),
      api.listPresets(),
    ]);
    // All three rejected with ApiError(401)
    for (const r of results) {
      expect(r.status).toBe('rejected');
      if (r.status === 'rejected') expect((r.reason as { status?: number }).status).toBe(401);
    }
    // But only ONE navigation happened.
    expect(navigations).toHaveLength(1);
    expect(navigations[0]).toBe('/login?return=' + encodeURIComponent('/'));
  });

  test('U4.A5: non-401 errors do not navigate', async () => {
    mockFetchOnce(500, { error: 'boom' });
    await expect(api.getStatus()).rejects.toMatchObject({ status: 500 });
    expect(mockLocation.href).toBe('http://localhost/');
  });

  test('U4.A6: fetch is called with Accept: application/json so the server returns 401 (not 303)', async () => {
    const spy = mockFetchOnce(200, { ok: true });
    await api.play();
    const args = spy.mock.calls[0];
    const init = args[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.Accept).toBe('application/json');
  });
});
