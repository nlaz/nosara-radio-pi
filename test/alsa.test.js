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

const SAMPLE_APLAY = `**** List of PLAYBACK Hardware Devices ****
card 0: Headphones [bcm2835 Headphones], device 0: bcm2835 Headphones [bcm2835 Headphones]
  Subdevices: 8/8
  Subdevice #0: subdevice #0
card 1: Device [USB Audio Device], device 0: USB Audio Device [USB Audio Device]
  Subdevices: 1/1
  Subdevice #0: subdevice #0
`;

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

// ── setCard / getCard ───────────────────────────────────────────────────────

test('U3.T8: setCard changes the card used by subsequent amixer calls', async (t) => {
  alsa.setCard('2');
  const calls = mockExecFile(t, ['', SAMPLE_ON]);
  await alsa.setVolume(75);
  assert.equal(calls[0].args[1], '2');
  alsa._resetCard(); // restore default for later tests
});

test('U3.T9: getCard returns the current card index', () => {
  alsa._resetCard();
  assert.equal(alsa.getCard(), '0');
  alsa.setCard('3');
  assert.equal(alsa.getCard(), '3');
  alsa._resetCard();
});

// ── listCards ───────────────────────────────────────────────────────────────

test('U3.T10: listCards parses aplay -l output into card objects', async (t) => {
  mockExecFile(t, [SAMPLE_APLAY]);
  const cards = await alsa.listCards();
  assert.equal(cards.length, 2);
  assert.deepEqual(cards[0], { index: '0', name: 'bcm2835 Headphones' });
  assert.deepEqual(cards[1], { index: '1', name: 'USB Audio Device' });
});

test('U3.T11: listCards returns [] when aplay fails', async (t) => {
  mockExecFile(t, [{ error: new Error('not found'), stderr: '' }]);
  const cards = await alsa.listCards();
  assert.deepEqual(cards, []);
});

test('U3.T12: listCards deduplicates cards that appear on multiple device lines', async (t) => {
  const multiDevice = `**** List of PLAYBACK Hardware Devices ****
card 0: Headphones [bcm2835 Headphones], device 0: bcm2835 Headphones [bcm2835 Headphones]
  Subdevices: 8/8
  Subdevice #0: subdevice #0
card 0: Headphones [bcm2835 Headphones], device 1: some other device
`;
  mockExecFile(t, [multiDevice]);
  const cards = await alsa.listCards();
  assert.equal(cards.length, 1);
  assert.equal(cards[0].index, '0');
});

// ── findCard ────────────────────────────────────────────────────────────────

test('U3.T13: findCard matches case-insensitively by name substring', () => {
  const cards = [
    { index: '0', name: 'bcm2835 Headphones' },
    { index: '1', name: 'USB Audio Device' },
  ];
  assert.deepEqual(alsa.findCard(cards, 'usb audio'), { index: '1', name: 'USB Audio Device' });
  assert.deepEqual(alsa.findCard(cards, 'USB AUDIO'), { index: '1', name: 'USB Audio Device' });
  assert.equal(alsa.findCard(cards, 'nonexistent'), null);
});

test('U3.T14: findCard returns null for empty/nullish pattern', () => {
  const cards = [{ index: '0', name: 'Some Device' }];
  assert.equal(alsa.findCard(cards, ''), null);
  assert.equal(alsa.findCard(cards, null), null);
  assert.equal(alsa.findCard(cards, undefined), null);
});

// ── watchDevice ─────────────────────────────────────────────────────────────

test('U3.T15: watchDevice fires onAppear when device transitions absent→present', async () => {
  const appeared = [];
  let callCount = 0;
  // First call: no device. Second call: device present.
  const listCardsFn = async () => {
    callCount++;
    if (callCount < 2) return [{ index: '0', name: 'bcm2835 Headphones' }];
    return [
      { index: '0', name: 'bcm2835 Headphones' },
      { index: '1', name: 'USB Audio Device' },
    ];
  };

  const stop = alsa.watchDevice('USB Audio', {
    onAppear: (card) => appeared.push(card),
    intervalMs: 20,
    listCardsFn,
  });

  // Wait enough time for two ticks
  await new Promise((r) => setTimeout(r, 60));
  stop();

  assert.equal(appeared.length, 1);
  assert.deepEqual(appeared[0], { index: '1', name: 'USB Audio Device' });
});

test('U3.T16: watchDevice fires onDisappear when device transitions present→absent', async () => {
  const disappeared = [];
  let callCount = 0;
  // First call: device present. Second call: gone.
  const listCardsFn = async () => {
    callCount++;
    if (callCount < 2) {
      return [
        { index: '0', name: 'bcm2835 Headphones' },
        { index: '1', name: 'USB Audio Device' },
      ];
    }
    return [{ index: '0', name: 'bcm2835 Headphones' }];
  };

  const stop = alsa.watchDevice('USB Audio', {
    onDisappear: () => disappeared.push(true),
    intervalMs: 20,
    listCardsFn,
  });

  await new Promise((r) => setTimeout(r, 60));
  stop();

  assert.equal(disappeared.length, 1);
});

test('U3.T17: watchDevice does not re-fire when presence is stable', async () => {
  const appeared = [];
  // Always returns the device present
  const listCardsFn = async () => [{ index: '1', name: 'USB Audio Device' }];

  const stop = alsa.watchDevice('USB Audio', {
    onAppear: (card) => appeared.push(card),
    intervalMs: 20,
    listCardsFn,
  });

  await new Promise((r) => setTimeout(r, 80));
  stop();

  // Should fire exactly once on the first tick, not on subsequent stable ticks
  assert.equal(appeared.length, 1);
});

test('U3.T18: watchDevice stop() cancels polling', async () => {
  let listCallCount = 0;
  const listCardsFn = async () => { listCallCount++; return []; };

  const stop = alsa.watchDevice('USB Audio', {
    intervalMs: 20,
    listCardsFn,
  });

  await new Promise((r) => setTimeout(r, 30));
  const countAtStop = listCallCount;
  stop();
  await new Promise((r) => setTimeout(r, 60));

  // No additional polls after stop
  assert.equal(listCallCount, countAtStop);
});
