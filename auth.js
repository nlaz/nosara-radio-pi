const crypto = require('node:crypto');

const COOKIE_NAME = 'radio_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_RATE_LIMIT = Object.freeze({
  maxFails: 5,
  windowMs: 5 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000,
});

function getHeader(req, name) {
  if (typeof req.get === 'function') return req.get(name);
  return req.headers?.[name.toLowerCase()];
}

function isTunneled(req) {
  const h = getHeader(req, 'Cf-Connecting-Ip');
  return typeof h === 'string' && h.length > 0;
}

function ipForRateLimit(req) {
  const h = getHeader(req, 'Cf-Connecting-Ip');
  if (typeof h === 'string' && h.length > 0) return h;
  return req.ip || 'unknown';
}

function verifyPin(submitted, expected) {
  if (typeof submitted !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  if (typeof s !== 'string' || s.length === 0) return null;
  const rem = s.length % 4;
  const pad = rem === 2 ? '==' : rem === 3 ? '=' : rem === 0 ? '' : null;
  if (pad === null) return null;
  try {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
  } catch {
    return null;
  }
}

function pinFingerprint(secret, pin) {
  return crypto.createHmac('sha256', secret).update(pin).digest('hex').slice(0, 16);
}

function signSession(payload, secret) {
  const body = b64urlEncode(JSON.stringify(payload));
  const hmac = crypto.createHmac('sha256', secret).update(body).digest();
  return `${body}.${b64urlEncode(hmac)}`;
}

function verifySession(token, secret, currentPin, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const sig = b64urlDecode(token.slice(dot + 1));
  if (!sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(sig, expected)) return null;
  const json = b64urlDecode(body);
  if (!json) return null;
  let payload;
  try { payload = JSON.parse(json.toString('utf8')); }
  catch { return null; }
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
  if (typeof payload.pin_fingerprint !== 'string') return null;
  if (payload.pin_fingerprint !== pinFingerprint(secret, currentPin)) return null;
  return payload;
}

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Returns a same-origin path safe to use in a Location header. Rejects any
// off-host URL, header-splitting attempts, and protocol-relative variants by
// parsing against a placeholder origin and verifying the host did not change.
function sanitizeReturnPath(input) {
  if (typeof input !== 'string' || input.length === 0) return '/';
  if (input.includes('\r') || input.includes('\n')) return '/';
  if (/%0[dDaA]/.test(input)) return '/';
  if (input.startsWith('//') || input.startsWith('/\\')) return '/';
  let parsed;
  try {
    parsed = new URL(input, 'http://placeholder.invalid/');
  } catch {
    return '/';
  }
  if (parsed.host !== 'placeholder.invalid') return '/';
  if (!parsed.pathname.startsWith('/')) return '/';
  return parsed.pathname + parsed.search + parsed.hash;
}

function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string' || header.length === 0) return out;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

function createRateLimiter(opts = {}) {
  const cfg = { ...DEFAULT_RATE_LIMIT, ...opts };
  const now = opts.now || (() => Date.now());
  const state = new Map();

  function isLockedOut(ip) {
    const e = state.get(ip);
    if (!e) return false;
    const t = now();
    if (e.fails >= cfg.maxFails && t - e.firstFailAt < cfg.lockoutMs) return true;
    if (t - e.firstFailAt >= cfg.lockoutMs) state.delete(ip);
    return false;
  }

  function recordFailure(ip) {
    const t = now();
    const e = state.get(ip);
    if (!e || t - e.firstFailAt >= cfg.windowMs) {
      state.set(ip, { firstFailAt: t, fails: 1 });
    } else {
      e.fails += 1;
    }
  }

  function recordSuccess(ip) {
    state.delete(ip);
  }

  return { isLockedOut, recordFailure, recordSuccess };
}

module.exports = {
  COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  DEFAULT_RATE_LIMIT,
  isTunneled,
  ipForRateLimit,
  verifyPin,
  pinFingerprint,
  signSession,
  verifySession,
  escapeHtml,
  sanitizeReturnPath,
  parseCookies,
  createRateLimiter,
};
