const { test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const alsa = require('../alsa');

const SAMPLE_ON = `Simple mixer control 'Digital',0
  Capabilities: pvolume pswitch
  Playback channels: Front Left - Front Right
  Limits: Playback 0 - 207
  Mono:
  Front Left: Playback 207 [100%] [0.00dB] [on]
  Front Right: Playback 207 [100%] [0.00dB] [on]
`;
const SAMPLE_OFF = SAMPLE_ON.replace(/\[on\]/g, '[off]');
const SAMPLE_50 = SAMPLE_ON.replace(/\[100%\]/g, '[50%]');

function mockExecFile(t, responses) {
  const calls = [];
  let i = 0;
  t.mock.method(cp, 'execFile', (_cmd, args, cb) => {
    calls.push({ args });
    const r = responses[i++] ?? SAMPLE_ON;
    setImmediate(() => {
      if (typeof r === 'string') return cb(null, r, '');
      if (r.error) return cb(r.error, r.stdout || '', r.stderr || '');
      return cb(null, r.stdout || '', r.stderr || '');
    });
  });
  return calls;
}

test('U3.T1: getVolume parses canonical output', async (t) => {
  mockExecFile(t, [SAMPLE_ON]);
  const v = await alsa.getVolume();
  assert.deepEqual(v, { percent: 100, muted: false });
});

test('U3.T2: getVolume parses muted output', async (t) => {
  mockExecFile(t, [SAMPLE_OFF]);
  const v = await alsa.getVolume();
  assert.deepEqual(v, { percent: 100, muted: true });
});

test('U3.T3: setVolume invokes amixer sset with percent', async (t) => {
  const calls = mockExecFile(t, ['', SAMPLE_50]);
  const v = await alsa.setVolume(50);
  assert.deepEqual(calls[0].args, ['-c', '0', 'sset', 'Digital', '50%']);
  assert.deepEqual(v, { percent: 50, muted: false });
});

test('U3.T3b: setVolume rounds fractional values', async (t) => {
  const calls = mockExecFile(t, ['', SAMPLE_ON]);
  await alsa.setVolume(50.7);
  assert.equal(calls[0].args[4], '51%');
});

test('U3.T4: setVolume accepts boundaries and rejects out-of-range', async (t) => {
  mockExecFile(t, Array(8).fill(SAMPLE_ON));
  await assert.doesNotReject(alsa.setVolume(0));
  await assert.doesNotReject(alsa.setVolume(100));
  await assert.rejects(alsa.setVolume(-1), RangeError);
  await assert.rejects(alsa.setVolume(101), RangeError);
});

test('U3.T5: setVolume rejects non-numeric input', async () => {
  await assert.rejects(alsa.setVolume('abc'), TypeError);
  await assert.rejects(alsa.setVolume(null), TypeError);
  await assert.rejects(alsa.setVolume(NaN), TypeError);
});

test('U3.T6: mute/unmute invoke correct amixer subcommands', async (t) => {
  const calls = mockExecFile(t, ['', SAMPLE_OFF, '', SAMPLE_ON]);
  await alsa.mute();
  assert.deepEqual(calls[0].args, ['-c', '0', 'sset', 'Digital', 'mute']);
  await alsa.unmute();
  assert.deepEqual(calls[2].args, ['-c', '0', 'sset', 'Digital', 'unmute']);
});

test('setMuted(true) calls mute, setMuted(false) calls unmute', async (t) => {
  const calls = mockExecFile(t, ['', SAMPLE_OFF, '', SAMPLE_ON]);
  await alsa.setMuted(true);
  assert.equal(calls[0].args[4], 'mute');
  await alsa.setMuted(false);
  assert.equal(calls[2].args[4], 'unmute');
});

test('U3.T7: throws AlsaUnavailable on exec error', async (t) => {
  mockExecFile(t, [{ error: Object.assign(new Error('amixer: not found'), { code: 127 }), stderr: 'amixer: not found' }]);
  await assert.rejects(alsa.getVolume(), alsa.AlsaUnavailable);
});

test('throws AlsaUnavailable on unparseable output', async (t) => {
  mockExecFile(t, ['totally unexpected output']);
  await assert.rejects(alsa.getVolume(), alsa.AlsaUnavailable);
});
