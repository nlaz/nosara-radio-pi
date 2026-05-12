const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  COOKIE_NAME,
  SESSION_MAX_AGE_MS,
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
} = require('../auth');

const SECRET = 'a'.repeat(32);
const PIN = 'puravida';

function reqWith(headers = {}, extras = {}) {
  return {
    headers,
    get(name) { return headers[name.toLowerCase()]; },
    ...extras,
  };
}

test('U1.T1: isTunneled true when Cf-Connecting-Ip header is set', () => {
  assert.equal(isTunneled(reqWith({ 'cf-connecting-ip': '1.2.3.4' })), true);
});

test('U1.T2: isTunneled false when header is absent', () => {
  assert.equal(isTunneled(reqWith({})), false);
});

test('U1.T3: isTunneled false on empty-string header', () => {
  assert.equal(isTunneled(reqWith({ 'cf-connecting-ip': '' })), false);
});

test('U1.T4: ipForRateLimit returns Cf-Connecting-Ip when present', () => {
  assert.equal(ipForRateLimit(reqWith({ 'cf-connecting-ip': '5.6.7.8' }, { ip: '127.0.0.1' })), '5.6.7.8');
});

test('U1.T5: ipForRateLimit falls back to req.ip when header absent', () => {
  assert.equal(ipForRateLimit(reqWith({}, { ip: '192.168.1.10' })), '192.168.1.10');
});

test('U1.T6: verifyPin true on exact match', () => {
  assert.equal(verifyPin('puravida', 'puravida'), true);
});

test('U1.T7: verifyPin false on different content of same length', () => {
  assert.equal(verifyPin('puravidx', 'puravida'), false);
});

test('U1.T8: verifyPin false on different length', () => {
  assert.equal(verifyPin('puravid', 'puravida'), false);
  assert.equal(verifyPin('puravidaa', 'puravida'), false);
});

test('U1.T9: verifyPin does not throw on empty / non-string input', () => {
  assert.equal(verifyPin('', 'puravida'), false);
  assert.equal(verifyPin(null, 'puravida'), false);
  assert.equal(verifyPin(undefined, 'puravida'), false);
});

test('U1.T10: signSession + verifySession round-trip', () => {
  const now = 1_700_000_000_000;
  const payload = {
    iat: now,
    exp: now + SESSION_MAX_AGE_MS,
    pin_fingerprint: pinFingerprint(SECRET, PIN),
  };
  const token = signSession(payload, SECRET);
  const verified = verifySession(token, SECRET, PIN, now + 1000);
  assert.ok(verified);
  assert.equal(verified.exp, payload.exp);
});

test('U1.T11: verifySession returns null with a different SECRET', () => {
  const now = 1_700_000_000_000;
  const token = signSession({ iat: now, exp: now + 1000, pin_fingerprint: pinFingerprint(SECRET, PIN) }, SECRET);
  assert.equal(verifySession(token, 'different-secret', PIN, now), null);
});

test('U1.T12: verifySession returns null when PIN has rotated (fingerprint mismatch)', () => {
  const now = 1_700_000_000_000;
  const token = signSession({ iat: now, exp: now + SESSION_MAX_AGE_MS, pin_fingerprint: pinFingerprint(SECRET, 'oldpin') }, SECRET);
  assert.equal(verifySession(token, SECRET, 'newpin', now + 1000), null);
});

test('U1.T13: verifySession returns null when exp is in the past', () => {
  const now = 1_700_000_000_000;
  const token = signSession({ iat: now - 10_000, exp: now - 1000, pin_fingerprint: pinFingerprint(SECRET, PIN) }, SECRET);
  assert.equal(verifySession(token, SECRET, PIN, now), null);
});

test('U1.T14: verifySession returns null for malformed input', () => {
  assert.equal(verifySession('not-a-token', SECRET, PIN), null);
  assert.equal(verifySession('only.one.dot.too.many', SECRET, PIN), null);
  assert.equal(verifySession('', SECRET, PIN), null);
  assert.equal(verifySession(null, SECRET, PIN), null);
  assert.equal(verifySession('body.', SECRET, PIN), null);
  assert.equal(verifySession('.sig', SECRET, PIN), null);
});

test('U1.T15: verifySession rejects truncated HMAC', () => {
  const now = 1_700_000_000_000;
  const token = signSession({ iat: now, exp: now + 1000, pin_fingerprint: pinFingerprint(SECRET, PIN) }, SECRET);
  const [body, sig] = token.split('.');
  assert.equal(verifySession(`${body}.${sig.slice(0, 5)}`, SECRET, PIN, now), null);
});

test('U1.T16: pinFingerprint differs for different PINs under same SECRET', () => {
  assert.notEqual(pinFingerprint(SECRET, 'puravida'), pinFingerprint(SECRET, 'newpin'));
});

test('U1.T17: pinFingerprint differs for same PIN under different SECRETs', () => {
  assert.notEqual(pinFingerprint('secret-a', PIN), pinFingerprint('secret-b', PIN));
});

test('U1.T18: escapeHtml escapes the five canonical chars', () => {
  assert.equal(escapeHtml(`<script>alert("xss")&'</script>`),
    '&lt;script&gt;alert(&quot;xss&quot;)&amp;&#39;&lt;/script&gt;');
});

test('U1.T19: escapeHtml returns empty string on non-string input', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '');
});

test('U1.T20: sanitizeReturnPath accepts simple paths', () => {
  assert.equal(sanitizeReturnPath('/'), '/');
  assert.equal(sanitizeReturnPath('/presets'), '/presets');
  assert.equal(sanitizeReturnPath('/foo/bar?x=1&y=2#frag'), '/foo/bar?x=1&y=2#frag');
});

test('U1.T21: sanitizeReturnPath rejects off-host redirects', () => {
  assert.equal(sanitizeReturnPath('//evil.com/'), '/');
  assert.equal(sanitizeReturnPath('https://evil.com/'), '/');
  assert.equal(sanitizeReturnPath('http://evil.com/'), '/');
  assert.equal(sanitizeReturnPath('\\\\evil.com'), '/');
});

test('U1.T22: sanitizeReturnPath rejects CRLF and encoded CRLF', () => {
  assert.equal(sanitizeReturnPath('/foo\r\nSet-Cookie: x=1'), '/');
  assert.equal(sanitizeReturnPath('/foo\nbar'), '/');
  assert.equal(sanitizeReturnPath('/foo%0d%0aSet-Cookie:x'), '/');
  assert.equal(sanitizeReturnPath('/foo%0D%0A'), '/');
});

test('U1.T23: sanitizeReturnPath defaults empty / non-string input to /', () => {
  assert.equal(sanitizeReturnPath(''), '/');
  assert.equal(sanitizeReturnPath(null), '/');
  assert.equal(sanitizeReturnPath(undefined), '/');
});

test('U1.T23b: sanitizeReturnPath normalizes relative input to a same-origin path', () => {
  // A bare relative segment becomes an on-origin path via base-URL resolution.
  // Browsers treat the resulting Location as on-origin, so this is safe.
  assert.equal(sanitizeReturnPath('not-a-path'), '/not-a-path');
});

test('U1.T24: parseCookies handles tolerant whitespace splitting', () => {
  assert.deepEqual(parseCookies('a=1; b=2'), { a: '1', b: '2' });
  assert.deepEqual(parseCookies('a=1;b=2'), { a: '1', b: '2' });
  assert.deepEqual(parseCookies('a=1;\tb=2'), { a: '1', b: '2' });
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies(null), {});
});

test('U1.T25: parseCookies tolerates equal-sign in cookie value', () => {
  assert.deepEqual(parseCookies('token=abc=def; other=z'), { token: 'abc=def', other: 'z' });
});

test('U1.T26: COOKIE_NAME constant', () => {
  assert.equal(COOKIE_NAME, 'radio_session');
});

// ── Rate limiter ────────────────────────────────────────────────────────────

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('U1.T30: rate limiter blocks after maxFails within window', () => {
  const clock = fakeClock();
  const rl = createRateLimiter({ maxFails: 3, windowMs: 60_000, lockoutMs: 600_000, now: clock.now });
  assert.equal(rl.isLockedOut('1.1.1.1'), false);
  rl.recordFailure('1.1.1.1');
  rl.recordFailure('1.1.1.1');
  rl.recordFailure('1.1.1.1');
  assert.equal(rl.isLockedOut('1.1.1.1'), true);
});

test('U1.T31: rate limiter tracks IPs independently', () => {
  const clock = fakeClock();
  const rl = createRateLimiter({ maxFails: 3, windowMs: 60_000, lockoutMs: 600_000, now: clock.now });
  rl.recordFailure('1.1.1.1');
  rl.recordFailure('1.1.1.1');
  rl.recordFailure('1.1.1.1');
  assert.equal(rl.isLockedOut('1.1.1.1'), true);
  assert.equal(rl.isLockedOut('2.2.2.2'), false);
  rl.recordFailure('2.2.2.2');
  rl.recordFailure('2.2.2.2');
  assert.equal(rl.isLockedOut('2.2.2.2'), false);
});

test('U1.T32: recordSuccess clears the counter for an IP', () => {
  const clock = fakeClock();
  const rl = createRateLimiter({ maxFails: 3, windowMs: 60_000, lockoutMs: 600_000, now: clock.now });
  rl.recordFailure('1.1.1.1');
  rl.recordFailure('1.1.1.1');
  rl.recordSuccess('1.1.1.1');
  rl.recordFailure('1.1.1.1');
  rl.recordFailure('1.1.1.1');
  assert.equal(rl.isLockedOut('1.1.1.1'), false);
});

test('U1.T33: lockout clears after lockoutMs elapses', () => {
  const clock = fakeClock();
  const rl = createRateLimiter({ maxFails: 3, windowMs: 60_000, lockoutMs: 100_000, now: clock.now });
  rl.recordFailure('1.1.1.1');
  rl.recordFailure('1.1.1.1');
  rl.recordFailure('1.1.1.1');
  assert.equal(rl.isLockedOut('1.1.1.1'), true);
  clock.advance(100_001);
  assert.equal(rl.isLockedOut('1.1.1.1'), false);
});

test('U1.T34: failures outside the window restart the counter', () => {
  const clock = fakeClock();
  const rl = createRateLimiter({ maxFails: 3, windowMs: 60_000, lockoutMs: 600_000, now: clock.now });
  rl.recordFailure('1.1.1.1');
  rl.recordFailure('1.1.1.1');
  clock.advance(61_000);
  rl.recordFailure('1.1.1.1');
  rl.recordFailure('1.1.1.1');
  assert.equal(rl.isLockedOut('1.1.1.1'), false);
});
