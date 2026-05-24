const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../server');

class StationNotFoundError extends Error { constructor(s) { super(s); this.name = 'StationNotFoundError'; } }
class EveningsApiUnreachable extends Error { constructor(s, c) { super(s); this.name = 'EveningsApiUnreachable'; this.cause = c; } }
class InvalidInput extends Error { constructor(s) { super(s); this.name = 'InvalidInput'; } }

function makeMocks(overrides = {}) {
  return {
    config: {
      _state: { active: 'demo', presets: [{ slug: 'demo', label: 'Demo' }] },
      read() { return JSON.parse(JSON.stringify(this._state)); },
      write(s) { this._state = JSON.parse(JSON.stringify(s)); },
      ...overrides.config,
    },
    stream: {
      _status: 'stopped',
      _streamUrl: null,
      _calls: [],
      getStatus() { return { status: this._status, errorMessage: null, streamUrl: this._streamUrl }; },
      start(url) { this._calls.push(['start', url]); this._status = 'connecting'; this._streamUrl = url; },
      stop() { this._calls.push(['stop']); this._status = 'stopped'; },
      pause() { this._calls.push(['pause']); this._status = 'paused'; },
      resume() { this._calls.push(['resume']); this._status = 'connecting'; },
      restart() { this._calls.push(['restart']); },
      setStation({ streamUrl }) { this._calls.push(['setStation', streamUrl]); this._streamUrl = streamUrl; this._status = 'connecting'; },
      ...overrides.stream,
    },
    alsa: {
      getVolume: async () => ({ percent: 80, muted: false }),
      setVolume: async (p) => ({ percent: p, muted: false }),
      setMuted: async (m) => ({ percent: 80, muted: m }),
      setCard: () => {},
      watchDevice: () => () => {}, // no-op watcher; override per test as needed
      ...overrides.alsa,
    },
    evenings: {
      extractSlug: (input) => {
        if (typeof input !== 'string' || !input.trim()) throw new InvalidInput(input);
        return { kind: 'station', slug: input };
      },
      resolveStation: async () => ({
        slug: 'demo', kind: 'station',
        streamUrl: 'http://stream.example/demo',
        name: 'Demo Station', image: 'http://img/x.jpg',
        host: null, online: true, listeners: 3,
        fetchedAt: '2026-05-12T00:00:00.000Z',
        apiReachable: true,
      }),
      InvalidInput, StationNotFoundError, EveningsApiUnreachable,
      ...overrides.evenings,
    },
    execFile: overrides.execFile || ((_cmd, _args, cb) => setImmediate(() => cb(null, 'log output', ''))),
    getDeviceName: overrides.getDeviceName || (() => ''),
  };
}

function listenOnPort(app) {
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function close(srv) {
  return new Promise((resolve) => srv.close(resolve));
}

async function request(srv, method, urlPath, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const headers = body ? { 'Content-Type': 'application/json' } : {};
    Object.assign(headers, extraHeaders || {});
    const req = http.request({
      method, port: srv.address().port, host: '127.0.0.1', path: urlPath,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch {}
        resolve({ status: res.statusCode, text, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.end(JSON.stringify(body));
    else req.end();
  });
}

async function requestForm(srv, urlPath, formBody, extraHeaders) {
  const body = new URLSearchParams(formBody).toString();
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    };
    Object.assign(headers, extraHeaders || {});
    const req = http.request({
      method: 'POST', port: srv.address().port, host: '127.0.0.1', path: urlPath, headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, text, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function withApp(mocks, fn) {
  const handles = createApp(mocks);
  const srv = await listenOnPort(handles.app);
  try { await fn({ srv, ...handles, mocks }); }
  finally { handles.stopPoll(); handles.stopDeviceWatch?.(); await close(srv); }
}

test('U4.T1: GET /api/status returns the aggregated shape', async () => {
  const mocks = makeMocks();
  await withApp(mocks, async ({ srv, refreshStation }) => {
    await refreshStation();
    const { status, json } = await request(srv, 'GET', '/api/status');
    assert.equal(status, 200);
    assert.equal(json.bridge.status, 'connecting');
    assert.equal(json.station.name, 'Demo Station');
    assert.equal(json.station.apiReachable, true);
    assert.equal(json.audio.percent, 80);
    assert.equal(json.audio.muted, false);
    assert.equal(json.active, 'demo');
    assert.deepEqual(json.presets, [{ slug: 'demo', label: 'Demo' }]);
  });
});

test('U4.T2: status reflects apiReachable=false on API failure', async () => {
  const mocks = makeMocks({
    evenings: {
      resolveStation: async () => { throw new EveningsApiUnreachable('down'); },
    },
  });
  await withApp(mocks, async ({ srv, refreshStation }) => {
    await refreshStation();
    const { json } = await request(srv, 'GET', '/api/status');
    assert.equal(json.station.apiReachable, false);
    assert.equal(json.station.name, null);
  });
});

test('U4.T3: POST /api/pause invokes stream.pause', async () => {
  await withApp(makeMocks(), async ({ srv, mocks }) => {
    const { status, json } = await request(srv, 'POST', '/api/pause');
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.ok(mocks.stream._calls.some(([m]) => m === 'pause'));
  });
});

test('U4.T4: POST /api/play resumes when paused', async () => {
  const mocks = makeMocks();
  mocks.stream._status = 'paused';
  await withApp(mocks, async ({ srv }) => {
    await request(srv, 'POST', '/api/play');
    assert.ok(mocks.stream._calls.some(([m]) => m === 'resume'));
  });
});

test('U4.T5: PUT /api/volume calls alsa.setVolume', async () => {
  const calls = [];
  const mocks = makeMocks({
    alsa: { setVolume: async (p) => { calls.push(p); return { percent: p, muted: false }; }, getVolume: async () => ({ percent: 80, muted: false }), setMuted: async () => ({ percent: 80, muted: false }) },
  });
  await withApp(mocks, async ({ srv }) => {
    const { status, json } = await request(srv, 'PUT', '/api/volume', { percent: 50 });
    assert.equal(status, 200);
    assert.equal(json.percent, 50);
    assert.deepEqual(calls, [50]);
  });
});

test('U4.T6: PUT /api/volume rejects out-of-range', async () => {
  await withApp(makeMocks(), async ({ srv }) => {
    const { status } = await request(srv, 'PUT', '/api/volume', { percent: 150 });
    assert.equal(status, 400);
  });
});

test('U4.T7: PUT /api/mute toggles via alsa.setMuted', async () => {
  const calls = [];
  const mocks = makeMocks({
    alsa: { setMuted: async (m) => { calls.push(m); return { percent: 80, muted: m }; }, getVolume: async () => ({ percent: 80, muted: false }), setVolume: async () => ({ percent: 80, muted: false }) },
  });
  await withApp(mocks, async ({ srv }) => {
    await request(srv, 'PUT', '/api/mute', { muted: true });
    assert.deepEqual(calls, [true]);
  });
});

test('U4.T8: preset CRUD (POST, GET, DELETE)', async () => {
  await withApp(makeMocks(), async ({ srv }) => {
    const add = await request(srv, 'POST', '/api/presets', { slug: 'nosara-pirate-radio', label: 'Nosara' });
    assert.equal(add.status, 201);
    assert.equal(add.json.length, 2);
    const list = await request(srv, 'GET', '/api/presets');
    assert.equal(list.json.length, 2);
    const del = await request(srv, 'DELETE', '/api/presets/demo');
    assert.equal(del.status, 200);
    assert.equal(del.json.length, 1);
    assert.equal(del.json[0].slug, 'nosara-pirate-radio');
  });
});

test('U4.T9: POST /api/reboot returns 202 immediately', async () => {
  const execCalls = [];
  const mocks = makeMocks({ execFile: (cmd, args, cb) => { execCalls.push([cmd, args]); setImmediate(() => cb(null, '', '')); } });
  await withApp(mocks, async ({ srv }) => {
    const { status, json } = await request(srv, 'POST', '/api/reboot');
    assert.equal(status, 202);
    assert.equal(json.ok, true);
    // Wait long enough for the 500ms delayed exec to fire
    await new Promise((r) => setTimeout(r, 700));
    assert.deepEqual(execCalls[0], ['sudo', ['/sbin/reboot']]);
  });
});

test('U4.T10: GET /api/logs invokes journalctl with line count', async () => {
  const execCalls = [];
  const mocks = makeMocks({ execFile: (cmd, args, cb) => { execCalls.push([cmd, args]); setImmediate(() => cb(null, 'log lines here', '')); } });
  await withApp(mocks, async ({ srv }) => {
    const { status, text } = await request(srv, 'GET', '/api/logs?lines=50');
    assert.equal(status, 200);
    assert.equal(text, 'log lines here');
    assert.equal(execCalls[0][0], 'journalctl');
    assert.deepEqual(execCalls[0][1], ['-u', 'radio-web', '-n', '50', '--no-pager']);
  });
});

test('U4.T11: stream URL rotation triggers setStation exactly once per change', async () => {
  let url = 'http://stream.example/v1';
  const mocks = makeMocks({
    evenings: {
      resolveStation: async () => ({
        slug: 'demo', kind: 'station', streamUrl: url,
        name: 'Demo', image: null, host: null, online: true, listeners: 0,
        fetchedAt: new Date().toISOString(), apiReachable: true,
      }),
      InvalidInput, StationNotFoundError, EveningsApiUnreachable,
    },
  });
  await withApp(mocks, async ({ refreshStation, mocks: m }) => {
    await refreshStation();
    await refreshStation(); // same URL, should NOT setStation again
    url = 'http://stream.example/v2';
    await refreshStation(); // rotated; SHOULD setStation
    const setStationCalls = m.stream._calls.filter(([fn]) => fn === 'setStation');
    assert.equal(setStationCalls.length, 2);
    assert.equal(setStationCalls[0][1], 'http://stream.example/v1');
    assert.equal(setStationCalls[1][1], 'http://stream.example/v2');
  });
});

test('U4.T12: PUT /api/station resolves and starts playback', async () => {
  const resolveCalls = [];
  const mocks = makeMocks({
    evenings: {
      extractSlug: () => ({ kind: 'station', slug: 'new-station' }),
      resolveStation: async (cls) => {
        resolveCalls.push(cls);
        return { slug: 'new-station', kind: 'station', streamUrl: 'http://stream/new', name: 'New', image: null, host: null, online: true, listeners: 0, fetchedAt: new Date().toISOString(), apiReachable: true };
      },
      InvalidInput, StationNotFoundError, EveningsApiUnreachable,
    },
  });
  await withApp(mocks, async ({ srv, mocks: m }) => {
    const { status, json } = await request(srv, 'PUT', '/api/station', { input: 'https://evenings.fm/new-station' });
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.station.name, 'New');
    assert.equal(resolveCalls[0].slug, 'new-station');
    assert.equal(m.config._state.active, 'new-station');
    const setStationCalls = m.stream._calls.filter(([fn]) => fn === 'setStation');
    assert.equal(setStationCalls.length, 1);
    assert.equal(setStationCalls[0][1], 'http://stream/new');
  });
});

test('U4.T13: PUT /api/station with bad input returns 400; not-found returns 404', async () => {
  await withApp(makeMocks(), async ({ srv }) => {
    const empty = await request(srv, 'PUT', '/api/station', { input: '' });
    assert.equal(empty.status, 400);
  });

  const mocks404 = makeMocks({
    evenings: {
      extractSlug: () => ({ kind: 'station', slug: 'nope' }),
      resolveStation: async () => { throw new StationNotFoundError('nope'); },
      InvalidInput, StationNotFoundError, EveningsApiUnreachable,
    },
  });
  await withApp(mocks404, async ({ srv }) => {
    const nf = await request(srv, 'PUT', '/api/station', { input: 'nope' });
    assert.equal(nf.status, 404);
  });
});

test('U4.T14: POST /api/play with status=error and cached streamUrl calls setStation (not resume)', async () => {
  const mocks = makeMocks();
  await withApp(mocks, async ({ srv, refreshStation, mocks: m }) => {
    await refreshStation();
    m.stream._calls.length = 0; // drop the auto-start from refresh
    m.stream._status = 'error'; // simulate ffplay failure after a successful start
    await request(srv, 'POST', '/api/play');
    const calls = m.stream._calls.map(([fn]) => fn);
    assert.ok(calls.includes('setStation'));
    assert.ok(!calls.includes('resume'));
  });
});

test('U4.T15: POST /api/play with status=stopped and cached streamUrl calls setStation', async () => {
  const mocks = makeMocks();
  await withApp(mocks, async ({ srv, refreshStation, mocks: m }) => {
    await refreshStation();
    m.stream._calls.length = 0;
    m.stream._status = 'stopped';
    await request(srv, 'POST', '/api/play');
    const calls = m.stream._calls.map(([fn]) => fn);
    assert.ok(calls.includes('setStation'));
  });
});

test('U4.T16: POST /api/play with no cache and no currentStreamUrl returns 503', async () => {
  // No refreshStation call: stationCache stays null and stream._streamUrl is null.
  const mocks = makeMocks();
  mocks.stream._status = 'stopped';
  await withApp(mocks, async ({ srv }) => {
    const { status, json } = await request(srv, 'POST', '/api/play');
    assert.equal(status, 503);
    assert.match(json.error, /no stream available/i);
  });
});

test('U4.T17: refreshStation skips auto-start when station is off-air (online=false)', async () => {
  const mocks = makeMocks({
    evenings: {
      resolveStation: async () => ({
        slug: 'demo', kind: 'station', streamUrl: 'http://stream/v1',
        name: 'Demo', image: null, host: null, online: false, listeners: 0,
        fetchedAt: new Date().toISOString(), apiReachable: true,
      }),
      InvalidInput, StationNotFoundError, EveningsApiUnreachable,
    },
  });
  await withApp(mocks, async ({ refreshStation, mocks: m }) => {
    await refreshStation();
    const setStationCalls = m.stream._calls.filter(([fn]) => fn === 'setStation');
    assert.equal(setStationCalls.length, 0);
  });
});

test('U4.T18: refreshStation auto-starts media-kind URL even when online check absent', async () => {
  const mocks = makeMocks({
    evenings: {
      resolveStation: async () => ({
        slug: 'abc', kind: 'media', streamUrl: 'https://media.evenings.co/s/abc',
        name: null, image: null, host: null, online: null, listeners: null,
        fetchedAt: new Date().toISOString(), apiReachable: null,
      }),
      InvalidInput, StationNotFoundError, EveningsApiUnreachable,
    },
  });
  await withApp(mocks, async ({ refreshStation, mocks: m }) => {
    await refreshStation();
    const setStationCalls = m.stream._calls.filter(([fn]) => fn === 'setStation');
    assert.equal(setStationCalls.length, 1);
    assert.equal(setStationCalls[0][1], 'https://media.evenings.co/s/abc');
  });
});

test('U4.T19: cold-start /api/status returns description=null in station payload', async () => {
  const mocks = makeMocks();
  await withApp(mocks, async ({ srv }) => {
    const { json } = await request(srv, 'GET', '/api/status');
    assert.ok('description' in json.station);
    assert.equal(json.station.description, null);
  });
});

test('U4.T20: GET /api/status surfaces rebootPending after POST /api/reboot', async () => {
  const mocks = makeMocks({ execFile: (_cmd, _args, cb) => setImmediate(() => cb(null, '', '')) });
  await withApp(mocks, async ({ srv }) => {
    const before = await request(srv, 'GET', '/api/status');
    assert.equal(before.json.rebootPending, false);
    await request(srv, 'POST', '/api/reboot');
    const after = await request(srv, 'GET', '/api/status');
    assert.equal(after.json.rebootPending, true);
    const dup = await request(srv, 'POST', '/api/reboot');
    assert.equal(dup.status, 409);
    await new Promise((r) => setTimeout(r, 700)); // let timer fire so close() unrefs
  });
});

test('U4.T21: GET /api/logs returns JSON error on journalctl failure', async () => {
  const mocks = makeMocks({
    execFile: (_cmd, _args, cb) => setImmediate(() => cb(new Error('boom'), '', 'stderr msg')),
  });
  await withApp(mocks, async ({ srv }) => {
    const { status, json } = await request(srv, 'GET', '/api/logs');
    assert.equal(status, 500);
    assert.equal(json.error, 'stderr msg');
  });
});

test('U4.T22: POST /api/presets rejects invalid slug via evenings.extractSlug', async () => {
  const mocks = makeMocks({
    evenings: {
      extractSlug: () => { throw new InvalidInput('bad'); },
      resolveStation: async () => ({ slug: 'demo', kind: 'station', streamUrl: null, name: null, image: null, host: null, online: null, listeners: null, fetchedAt: null, apiReachable: true }),
      InvalidInput, StationNotFoundError, EveningsApiUnreachable,
    },
  });
  await withApp(mocks, async ({ srv }) => {
    const { status } = await request(srv, 'POST', '/api/presets', { slug: '!!bad!!', label: 'x' });
    assert.equal(status, 400);
  });
});

// ── U2: login routes ────────────────────────────────────────────────────────

const auth = require('../auth');

function authMocks(overrides = {}) {
  return {
    ...makeMocks(overrides),
    getPin: overrides.getPin || (() => 'puravida'),
    getSessionSecret: overrides.getSessionSecret || (() => 'a'.repeat(32)),
    rateLimiter: overrides.rateLimiter,
  };
}

test('U2.L1: GET /login returns 200 HTML with the form', async () => {
  await withApp(authMocks(), async ({ srv }) => {
    const { status, text, headers } = await request(srv, 'GET', '/login');
    assert.equal(status, 200);
    assert.match(headers['content-type'], /text\/html/);
    assert.match(text, /name="pin"/);
    assert.match(text, /name="return"/);
    assert.match(text, /action="\/login"/);
  });
});

test('U2.L2: GET /login?return=/presets reflects sanitized return into hidden field', async () => {
  await withApp(authMocks(), async ({ srv }) => {
    const { text } = await request(srv, 'GET', '/login?return=%2Fpresets');
    assert.match(text, /value="\/presets"/);
  });
});

test('U2.L3: GET /login XSS-escapes a malicious return value', async () => {
  await withApp(authMocks(), async ({ srv }) => {
    const { text } = await request(srv, 'GET', '/login?return=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    // The malicious value gets URL-rejected to '/', but even if it didn't, the
    // escapeHtml call would turn < and " into entities. Verify no live script.
    assert.ok(!text.includes('<script>alert(1)'));
  });
});

test('U2.L4: POST /login with wrong PIN returns 200 with Incorrect PIN message, no cookie', async () => {
  await withApp(authMocks(), async ({ srv }) => {
    const { status, text, headers } = await requestForm(srv, '/login', { pin: 'wrong', return: '/' });
    assert.equal(status, 200);
    assert.match(text, /Incorrect PIN/);
    assert.equal(headers['set-cookie'], undefined);
  });
});

test('U2.L5: POST /login with correct PIN returns 303 with Set-Cookie', async () => {
  await withApp(authMocks(), async ({ srv }) => {
    const { status, headers } = await requestForm(srv, '/login', { pin: 'puravida', return: '/' });
    assert.equal(status, 303);
    assert.equal(headers.location, '/');
    const cookie = (headers['set-cookie'] || [])[0] || '';
    assert.match(cookie, /^radio_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Max-Age=604800/);
  });
});

test('U2.L6: POST /login with malicious return redirects to /', async () => {
  await withApp(authMocks(), async ({ srv }) => {
    for (const r of ['//evil.com/', 'https://evil.com/', '/foo\r\nSet-Cookie: x=1', '/foo%0d%0a']) {
      const { status, headers } = await requestForm(srv, '/login', { pin: 'puravida', return: r });
      assert.equal(status, 303, `bad return "${r}" should still issue cookie`);
      assert.equal(headers.location, '/', `return "${r}" must resolve to /`);
    }
  });
});

test('U2.L7: POST /login lockout after MAX_FAILS failures, locks out further attempts', async () => {
  const rl = auth.createRateLimiter({ maxFails: 3, windowMs: 60_000, lockoutMs: 600_000 });
  await withApp(authMocks({ rateLimiter: rl }), async ({ srv }) => {
    for (let i = 0; i < 3; i++) {
      await requestForm(srv, '/login', { pin: 'wrong', return: '/' });
    }
    // Now even the correct PIN is rejected:
    const { status, text, headers } = await requestForm(srv, '/login', { pin: 'puravida', return: '/' });
    assert.equal(status, 200);
    assert.match(text, /Too many attempts/);
    assert.equal(headers['set-cookie'], undefined);
  });
});

test('U2.L8: rate limiter keys on Cf-Connecting-Ip independently from socket peer', async () => {
  const rl = auth.createRateLimiter({ maxFails: 3, windowMs: 60_000, lockoutMs: 600_000 });
  await withApp(authMocks({ rateLimiter: rl }), async ({ srv }) => {
    // 3 failures from IP A → A is locked out
    for (let i = 0; i < 3; i++) {
      await requestForm(srv, '/login', { pin: 'wrong', return: '/' }, { 'Cf-Connecting-Ip': '1.1.1.1' });
    }
    // Correct PIN from IP B still succeeds
    const { status, headers } = await requestForm(srv, '/login', { pin: 'puravida', return: '/' }, { 'Cf-Connecting-Ip': '2.2.2.2' });
    assert.equal(status, 303);
    assert.match((headers['set-cookie'] || [])[0] || '', /^radio_session=/);
  });
});

test('U2.L9: POST /login returns 503 when RADIO_PIN is unset', async () => {
  await withApp(authMocks({ getPin: () => undefined }), async ({ srv }) => {
    const { status, text, headers } = await requestForm(srv, '/login', { pin: 'puravida', return: '/' });
    assert.equal(status, 503);
    assert.match(text, /Auth not configured/);
    assert.equal(headers['set-cookie'], undefined);
  });
});

test('U2.L10: POST /logout clears the cookie and redirects to /login', async () => {
  await withApp(authMocks(), async ({ srv }) => {
    const { status, headers } = await requestForm(srv, '/logout', {});
    assert.equal(status, 303);
    assert.equal(headers.location, '/login');
    const cookie = (headers['set-cookie'] || [])[0] || '';
    assert.match(cookie, /radio_session=;/);
    assert.match(cookie, /Max-Age=0/);
  });
});

// ── U3: tunnel auth middleware ──────────────────────────────────────────────

const TUNNEL_HDR = { 'Cf-Connecting-Ip': '3.3.3.3' };

function validSessionCookie(pin = 'puravida', secret = 'a'.repeat(32), at = Date.now()) {
  const token = auth.signSession({
    iat: at,
    exp: at + auth.SESSION_MAX_AGE_MS,
    pin_fingerprint: auth.pinFingerprint(secret, pin),
  }, secret);
  return `${auth.COOKIE_NAME}=${token}`;
}

test('U3.M1: LAN request without Cf-Connecting-Ip bypasses the gate', async () => {
  await withApp(authMocks(), async ({ srv, refreshStation }) => {
    await refreshStation();
    const { status, json } = await request(srv, 'GET', '/api/status');
    assert.equal(status, 200);
    assert.equal(json.station.name, 'Demo Station');
  });
});

test('U3.M2: tunneled HTML request with no cookie redirects to /login with return path', async () => {
  await withApp(authMocks(), async ({ srv }) => {
    const { status, headers } = await request(srv, 'GET', '/presets', null,
      { ...TUNNEL_HDR, Accept: 'text/html' });
    assert.equal(status, 303);
    assert.match(headers.location || '', /^\/login\?return=/);
    assert.match(headers.location || '', /%2Fpresets/);
  });
});

test('U3.M3: tunneled JSON request with no cookie returns 401 JSON', async () => {
  await withApp(authMocks(), async ({ srv }) => {
    const { status, json } = await request(srv, 'GET', '/api/status', null,
      { ...TUNNEL_HDR, Accept: 'application/json' });
    assert.equal(status, 401);
    assert.equal(json.error, 'auth required');
  });
});

test('U3.M4: tunneled request with a valid session cookie reaches the protected route', async () => {
  await withApp(authMocks(), async ({ srv, refreshStation }) => {
    await refreshStation();
    const { status, json } = await request(srv, 'GET', '/api/status', null,
      { ...TUNNEL_HDR, Cookie: validSessionCookie() });
    assert.equal(status, 200);
    assert.equal(json.station.name, 'Demo Station');
  });
});

test('U3.M5: tunneled request with a cookie signed by a different PIN is rejected', async () => {
  await withApp(authMocks(), async ({ srv }) => {
    const stale = validSessionCookie('oldpin');
    const { status, json } = await request(srv, 'GET', '/api/status', null,
      { ...TUNNEL_HDR, Cookie: stale, Accept: 'application/json' });
    assert.equal(status, 401);
    assert.equal(json.error, 'auth required');
  });
});

test('U3.M6: /login and /logout are reachable through the tunnel without a cookie', async () => {
  await withApp(authMocks(), async ({ srv }) => {
    const g = await request(srv, 'GET', '/login', null, TUNNEL_HDR);
    assert.equal(g.status, 200);
    const p = await requestForm(srv, '/login', { pin: 'puravida', return: '/' }, TUNNEL_HDR);
    assert.equal(p.status, 303);
  });
});

test('U3.M7: tunneled request returns 503 when RADIO_PIN is unset', async () => {
  await withApp(authMocks({ getPin: () => undefined }), async ({ srv }) => {
    const { status, json } = await request(srv, 'GET', '/api/status', null,
      { ...TUNNEL_HDR, Accept: 'application/json' });
    assert.equal(status, 503);
    assert.equal(json.error, 'auth not configured');
  });
});

test('U3.M8: tunneled request returns 503 when RADIO_SESSION_SECRET is unset', async () => {
  await withApp(authMocks({ getSessionSecret: () => undefined }), async ({ srv }) => {
    const { status } = await request(srv, 'GET', '/api/status', null,
      { ...TUNNEL_HDR, Accept: 'application/json' });
    assert.equal(status, 503);
  });
});

test('U3.M9: POST /api/reboot over tunnel requires auth (401 without cookie)', async () => {
  await withApp(authMocks(), async ({ srv }) => {
    const { status } = await request(srv, 'POST', '/api/reboot', null,
      { ...TUNNEL_HDR, Accept: 'application/json' });
    assert.equal(status, 401);
  });
});

test('U3.M10: /skull.svg is bypassed even through the tunnel (for the login page)', async () => {
  await withApp(authMocks(), async ({ srv }) => {
    // dist/skull.svg may not exist in the test repo, but the gate should pass-through,
    // letting express.static handle it (and return 404 if file is missing).
    const { status } = await request(srv, 'GET', '/skull.svg', null, TUNNEL_HDR);
    assert.notEqual(status, 401);
    assert.notEqual(status, 303);
    assert.notEqual(status, 503);
  });
});

// ── U5: transmitter device watcher ─────────────────────────────────────────

test('U5.T1: transmitter is null in status when RADIO_ALSA_DEVICE_NAME is unset', async () => {
  // Default mocks have no getDeviceName override → no device watcher
  await withApp(makeMocks(), async ({ srv }) => {
    const { json } = await request(srv, 'GET', '/api/status');
    assert.equal(json.transmitter, null);
  });
});

test('U5.T2: transmitter shows present=false before device is found', async () => {
  const mocks = makeMocks({
    alsa: {
      getVolume: async () => ({ percent: 80, muted: false }),
      setVolume: async (p) => ({ percent: p, muted: false }),
      setMuted: async (m) => ({ percent: 80, muted: m }),
      setCard: () => {},
      // watchDevice never calls onAppear, so device stays absent
      watchDevice: (_name, _opts) => () => {},
    },
    getDeviceName: () => 'USB Audio',
  });
  await withApp(mocks, async ({ srv }) => {
    const { json } = await request(srv, 'GET', '/api/status');
    assert.deepEqual(json.transmitter, { present: false, card: null });
  });
});

test('U5.T3: onAppear updates transmitter state and restarts stream when playing', async () => {
  let capturedOnAppear;
  const cardsSeen = [];
  const mocks = makeMocks({
    alsa: {
      getVolume: async () => ({ percent: 80, muted: false }),
      setVolume: async (p) => ({ percent: p, muted: false }),
      setMuted: async (m) => ({ percent: 80, muted: m }),
      setCard: (idx) => cardsSeen.push(idx),
      watchDevice: (_name, { onAppear }) => {
        capturedOnAppear = onAppear;
        return () => {};
      },
    },
    getDeviceName: () => 'USB Audio',
  });
  mocks.stream._status = 'playing';

  await withApp(mocks, async ({ srv, mocks: m }) => {
    // Simulate the transmitter powering on
    capturedOnAppear({ index: '1', name: 'USB Audio Device' });

    const { json } = await request(srv, 'GET', '/api/status');
    assert.deepEqual(json.transmitter, { present: true, card: '1' });
    assert.deepEqual(cardsSeen, ['1']);
    assert.ok(m.stream._calls.some(([fn]) => fn === 'restart'));
  });
});

test('U5.T4: onAppear does not restart stream when stopped', async () => {
  let capturedOnAppear;
  const mocks = makeMocks({
    alsa: {
      getVolume: async () => ({ percent: 80, muted: false }),
      setVolume: async (p) => ({ percent: p, muted: false }),
      setMuted: async (m) => ({ percent: 80, muted: m }),
      setCard: () => {},
      watchDevice: (_name, { onAppear }) => {
        capturedOnAppear = onAppear;
        return () => {};
      },
    },
    getDeviceName: () => 'USB Audio',
  });
  mocks.stream._status = 'stopped';

  await withApp(mocks, async ({ mocks: m }) => {
    capturedOnAppear({ index: '1', name: 'USB Audio Device' });
    assert.ok(!m.stream._calls.some(([fn]) => fn === 'restart'));
  });
});

test('U5.T5: onDisappear sets transmitter present=false', async () => {
  let capturedOnAppear;
  let capturedOnDisappear;
  const mocks = makeMocks({
    alsa: {
      getVolume: async () => ({ percent: 80, muted: false }),
      setVolume: async (p) => ({ percent: p, muted: false }),
      setMuted: async (m) => ({ percent: 80, muted: m }),
      setCard: () => {},
      watchDevice: (_name, { onAppear, onDisappear }) => {
        capturedOnAppear = onAppear;
        capturedOnDisappear = onDisappear;
        return () => {};
      },
    },
    getDeviceName: () => 'USB Audio',
  });

  await withApp(mocks, async ({ srv }) => {
    capturedOnAppear({ index: '1', name: 'USB Audio Device' });
    const after = await request(srv, 'GET', '/api/status');
    assert.equal(after.json.transmitter.present, true);

    capturedOnDisappear();
    const gone = await request(srv, 'GET', '/api/status');
    assert.deepEqual(gone.json.transmitter, { present: false, card: null });
  });
});
