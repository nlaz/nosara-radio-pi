const express = require('express');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const auth = require('./auth');

const POLL_BACKOFF_MS = [10_000, 30_000, 60_000];
const DEFAULT_LOG_LINES = 200;
const MAX_LOG_LINES = 1000;

const LOGIN_TEMPLATE = fs.readFileSync(
  path.join(__dirname, 'views', 'login.html'),
  'utf8',
);

function renderLoginPage({ error, returnPath, disabled }) {
  const errorBlock = error
    ? `<p class="login-error" role="alert" aria-live="polite">${auth.escapeHtml(error)}</p>`
    : '';
  return LOGIN_TEMPLATE
    .replaceAll('__ERROR_BLOCK__', errorBlock)
    .replaceAll('__RETURN__', auth.escapeHtml(returnPath || '/'))
    .replaceAll('__DISABLED__', disabled ? 'disabled' : '');
}

function createApp(deps = {}) {
  const config = deps.config || require('./config');
  const stream = deps.stream || require('./stream');
  const alsa = deps.alsa || require('./alsa');
  const evenings = deps.evenings || require('./evenings');
  const execFile = deps.execFile || cp.execFile;
  const getPin = deps.getPin || (() => process.env.RADIO_PIN);
  const getSessionSecret = deps.getSessionSecret || (() => process.env.RADIO_SESSION_SECRET);
  const rateLimiter = deps.rateLimiter || auth.createRateLimiter();
  const now = deps.now || (() => Date.now());

  // Mutable state owned by this app instance
  const state = {
    stationCache: null,    // resolved station data (or media-derived shape)
    apiReachable: false,
    lastFetchAt: null,
    backoffIndex: 0,
    pollTimer: null,
    rebootPending: false,
    audioCache: { percent: null, muted: null }, // last known good ALSA state
  };

  // Prime audio cache once at boot; tolerate failure (e.g., dev workstation
  // without amixer). /api/status will still respond via the cache.
  alsa.getVolume().then((v) => {
    state.audioCache = { percent: v.percent, muted: v.muted };
  }).catch(() => { /* leave cache as null; /api/status will surface error */ });

  async function resolveActive() {
    const cfg = config.read();
    return evenings.resolveStation(cfg.active);
  }

  async function refreshStation() {
    let data;
    try {
      data = await resolveActive();
    } catch (err) {
      state.apiReachable = false;
      state.backoffIndex = Math.min(state.backoffIndex + 1, POLL_BACKOFF_MS.length - 1);
      return { ok: false, error: err };
    }
    const prevStreamUrl = state.stationCache?.streamUrl;
    state.stationCache = data;
    state.apiReachable = data.apiReachable !== false;
    state.lastFetchAt = data.fetchedAt || new Date().toISOString();
    state.backoffIndex = 0;
    // Auto-start when the stream URL changes — except when the station is
    // confirmed off-air. The user can still press Play manually, and the
    // next poll that finds online=true (and a new streamUrl) will start.
    const shouldAutoStart = data.streamUrl
      && data.streamUrl !== prevStreamUrl
      && (data.kind === 'media' || data.online !== false);
    if (shouldAutoStart) {
      stream.setStation({ streamUrl: data.streamUrl });
    }
    return { ok: true, data };
  }

  function schedulePoll() {
    if (state.pollTimer) clearTimeout(state.pollTimer);
    const wait = POLL_BACKOFF_MS[state.backoffIndex];
    state.pollTimer = setTimeout(async () => {
      await refreshStation();
      schedulePoll();
    }, wait);
    state.pollTimer.unref?.();
  }

  function stopPoll() {
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
  }

  const app = express();
  app.use(express.json());

  // --- Auth gate (tunneled requests only) ------------------------------
  // LAN traffic bypasses this entirely. Tunneled requests must carry a valid
  // signed session cookie or be on the login surface. Detection uses the
  // Cf-Connecting-Ip header which Cloudflare injects on every tunneled
  // request and which LAN traffic never carries.
  app.use((req, res, next) => {
    if (!auth.isTunneled(req)) return next();
    const p = req.path;
    if (p === '/login' || p === '/logout' || p === '/skull.svg') return next();

    const pin = getPin();
    const secret = getSessionSecret();
    if (!pin || !secret) {
      return res.status(503).json({ error: 'auth not configured' });
    }

    const cookies = auth.parseCookies(req.headers.cookie || '');
    const token = cookies[auth.COOKIE_NAME];
    if (token && auth.verifySession(token, secret, pin, now())) return next();

    if ((req.get('Accept') || '').includes('text/html')) {
      const ret = encodeURIComponent(req.originalUrl || '/');
      return res.redirect(303, `/login?return=${ret}`);
    }
    return res.status(401).json({ error: 'auth required' });
  });

  // --- Status (the aggregator the UI polls) -----------------------------
  app.get('/api/status', (_req, res) => {
    // Serve audio from cache. setVolume/setMuted update the cache on success;
    // getVolume errors invalidate it. This keeps /api/status off the amixer
    // hot path so the 1-second poll never blocks on a slow ALSA call.
    const audio = {
      percent: state.audioCache.percent,
      muted: state.audioCache.muted,
      error: state.audioCache.error || null,
    };
    const cfg = config.read();
    const bridge = stream.getStatus();
    res.json({
      bridge: { status: bridge.status, streamUrl: bridge.streamUrl },
      station: state.stationCache
        ? {
            ...state.stationCache,
            fetchedAt: state.lastFetchAt,
            apiReachable: state.apiReachable,
          }
        : { slug: cfg.active, kind: null, streamUrl: null, name: null, image: null, host: null, description: null, online: null, listeners: null, fetchedAt: null, apiReachable: state.apiReachable },
      audio,
      active: cfg.active,
      presets: cfg.presets,
      rebootPending: state.rebootPending,
    });
  });

  // --- Playback lifecycle ----------------------------------------------
  app.post('/api/play', (_req, res) => {
    const { status, streamUrl } = stream.getStatus();
    if (status === 'paused' || status === 'stopped' || status === 'error') {
      const cached = state.stationCache?.streamUrl;
      if (cached && status !== 'paused') {
        stream.setStation({ streamUrl: cached });
      } else if (status === 'paused' || streamUrl) {
        // resume() relies on stream.js's internal currentStreamUrl
        stream.resume();
      } else if (!cached) {
        // Nothing to play: no station resolved yet AND no prior URL retained.
        return res.status(503).json({ error: 'no stream available — set a station first' });
      } else {
        stream.resume();
      }
    }
    res.json({ ok: true });
  });

  app.post('/api/pause', (_req, res) => {
    stream.pause();
    res.json({ ok: true });
  });

  app.post('/api/stop', (_req, res) => {
    stream.stop();
    res.json({ ok: true });
  });

  app.post('/api/restart', (_req, res) => {
    stream.restart();
    res.json({ ok: true });
  });

  // --- Audio (ALSA) -----------------------------------------------------
  app.put('/api/volume', async (req, res) => {
    const pct = Number(req.body?.percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: 'percent must be a number 0-100' });
    }
    try {
      const next = await alsa.setVolume(pct);
      state.audioCache = { percent: next.percent, muted: next.muted };
      res.json(next);
    } catch (err) {
      state.audioCache = { percent: null, muted: null, error: err.message };
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/mute', async (req, res) => {
    if (typeof req.body?.muted !== 'boolean') {
      return res.status(400).json({ error: 'muted must be boolean' });
    }
    try {
      const next = await alsa.setMuted(req.body.muted);
      state.audioCache = { percent: next.percent, muted: next.muted };
      res.json(next);
    } catch (err) {
      state.audioCache = { percent: null, muted: null, error: err.message };
      res.status(500).json({ error: err.message });
    }
  });

  // --- Station + presets ------------------------------------------------
  app.put('/api/station', async (req, res) => {
    const input = req.body?.input;
    if (typeof input !== 'string' || !input.trim()) {
      return res.status(400).json({ error: 'input is required' });
    }
    let classification;
    try {
      classification = evenings.extractSlug(input);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    try {
      const data = await evenings.resolveStation(classification);
      const cfg = config.read();
      cfg.active = classification.slug;
      config.write(cfg);
      const prev = state.stationCache?.streamUrl;
      state.stationCache = data;
      state.apiReachable = data.apiReachable !== false;
      state.lastFetchAt = data.fetchedAt || new Date().toISOString();
      state.backoffIndex = 0;
      if (data.streamUrl && data.streamUrl !== prev) {
        stream.setStation({ streamUrl: data.streamUrl });
      }
      res.json({ ok: true, station: data });
    } catch (err) {
      if (err.name === 'StationNotFoundError') {
        return res.status(404).json({ error: err.message });
      }
      res.status(502).json({ error: err.message });
    }
  });

  app.get('/api/presets', (_req, res) => {
    res.json(config.read().presets);
  });

  app.post('/api/presets', (req, res) => {
    const { slug, label } = req.body || {};
    if (typeof slug !== 'string' || !slug.trim()) {
      return res.status(400).json({ error: 'slug is required' });
    }
    try {
      evenings.extractSlug(slug);
    } catch (err) {
      if (err.name === 'InvalidInput') return res.status(400).json({ error: err.message });
      throw err;
    }
    const cfg = config.read();
    if (cfg.presets.some((p) => p.slug === slug)) {
      return res.status(409).json({ error: 'preset already exists' });
    }
    cfg.presets.push({ slug, label: typeof label === 'string' && label.trim() ? label : slug });
    config.write(cfg);
    res.status(201).json(cfg.presets);
  });

  app.delete('/api/presets/:slug', (req, res) => {
    const { slug } = req.params;
    const cfg = config.read();
    const next = cfg.presets.filter((p) => p.slug !== slug);
    if (next.length === cfg.presets.length) {
      return res.status(404).json({ error: 'preset not found' });
    }
    cfg.presets = next;
    config.write(cfg);
    res.json(cfg.presets);
  });

  // --- Service / device controls ---------------------------------------
  app.post('/api/reboot', (_req, res) => {
    if (state.rebootPending) {
      return res.status(409).json({ error: 'reboot already pending' });
    }
    state.rebootPending = true;
    res.status(202).json({ ok: true, message: 'rebooting' });
    setTimeout(() => {
      execFile('sudo', ['/sbin/reboot'], (err) => {
        if (err) console.error('reboot failed:', err.message);
      });
    }, 500);
  });

  app.get('/api/logs', (req, res) => {
    let lines = Number(req.query.lines);
    if (!Number.isFinite(lines)) lines = DEFAULT_LOG_LINES;
    lines = Math.max(1, Math.min(MAX_LOG_LINES, Math.floor(lines)));
    execFile('journalctl', ['-u', 'radio-web', '-n', String(lines), '--no-pager'], (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: stderr || err.message });
      res.type('text/plain').send(stdout);
    });
  });

  // --- Authentication (login / logout) ---------------------------------
  // Route-scoped urlencoded parser; everything else stays JSON-only.
  const urlEncodedParser = express.urlencoded({ extended: false, limit: '4kb' });

  app.get('/login', (req, res) => {
    const ret = auth.sanitizeReturnPath(
      typeof req.query.return === 'string' ? req.query.return : '/',
    );
    res.type('html').send(renderLoginPage({ returnPath: ret, error: null, disabled: false }));
  });

  app.post('/login', urlEncodedParser, (req, res) => {
    const ret = auth.sanitizeReturnPath(
      typeof req.body?.return === 'string' ? req.body.return : '/',
    );
    const ip = auth.ipForRateLimit(req);

    if (rateLimiter.isLockedOut(ip)) {
      return res.status(200).type('html').send(renderLoginPage({
        returnPath: ret,
        error: 'Too many attempts. Try again later.',
        disabled: true,
      }));
    }

    const expected = getPin();
    const secret = getSessionSecret();
    if (!expected || !secret) {
      return res.status(503).type('html').send(renderLoginPage({
        returnPath: ret,
        error: 'Auth not configured on the server.',
        disabled: true,
      }));
    }

    const submitted = typeof req.body?.pin === 'string' ? req.body.pin : '';
    if (!auth.verifyPin(submitted, expected)) {
      rateLimiter.recordFailure(ip);
      return res.status(200).type('html').send(renderLoginPage({
        returnPath: ret,
        error: 'Incorrect PIN.',
        disabled: false,
      }));
    }

    rateLimiter.recordSuccess(ip);
    const t = now();
    const token = auth.signSession({
      iat: t,
      exp: t + auth.SESSION_MAX_AGE_MS,
      pin_fingerprint: auth.pinFingerprint(secret, expected),
    }, secret);
    const maxAge = Math.floor(auth.SESSION_MAX_AGE_MS / 1000);
    res.setHeader(
      'Set-Cookie',
      `${auth.COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
    );
    res.redirect(303, ret);
  });

  app.post('/logout', (_req, res) => {
    res.setHeader(
      'Set-Cookie',
      `${auth.COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
    );
    res.redirect(303, '/login');
  });

  // --- Static assets + SPA fallback ------------------------------------
  const distDir = path.join(__dirname, 'dist');
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    const idx = path.join(distDir, 'index.html');
    if (!fs.existsSync(idx)) {
      return res.status(503).type('html').send(
        `<!doctype html><html><head><meta charset="utf-8"><title>radio.local</title>`
        + `<style>body{font-family:system-ui;padding:2rem;max-width:42rem;margin:auto}code{background:#eee;padding:.1em .3em;border-radius:.2em}</style>`
        + `</head><body><h1>Frontend not built</h1>`
        + `<p>Run <code>npm install &amp;&amp; npm run build</code> on the Pi, then restart the service.</p>`
        + `</body></html>`,
      );
    }
    res.sendFile(idx);
  });

  return { app, state, refreshStation, schedulePoll, stopPoll };
}

async function boot() {
  const { app, refreshStation, schedulePoll } = createApp();
  await refreshStation();
  schedulePoll();
  const PORT = Number(process.env.PORT) || 80;
  app.listen(PORT, () => console.log(`Radio controller listening on port ${PORT}`));
}

if (require.main === module) {
  boot().catch((err) => {
    console.error('boot failed:', err);
    process.exit(1);
  });
}

module.exports = { createApp };
