const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const stream = require('../stream');

function makeFakeChild() {
  const child = new EventEmitter();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = (signal = 'SIGTERM') => {
    child.killed = true;
    setImmediate(() => child.emit('exit', null, signal));
  };
  return child;
}

function tick(n = 1) {
  let p = Promise.resolve();
  for (let i = 0; i < n; i++) p = p.then(() => new Promise(setImmediate));
  return p;
}

beforeEach(() => stream._resetForTests());

test('U2.T1: start sets connecting, then playing on audio line', async (t) => {
  const child = makeFakeChild();
  const spawnFake = t.mock.method(cp, 'spawn', () => child);
  stream.start('http://x/s');
  assert.equal(stream.getStatus().status, 'connecting');
  child.stderr.write('Stream #0:0: Audio: mp3, 44100 Hz, stereo\n');
  await tick();
  assert.equal(stream.getStatus().status, 'playing');
  assert.equal(spawnFake.mock.calls.length, 1);
});

test('U2.T2: start with no url throws', () => {
  assert.throws(() => stream.start(), TypeError);
  assert.throws(() => stream.start(''), TypeError);
  assert.throws(() => stream.start(null), TypeError);
});

test('U2.T3: stop sets status to stopped', async (t) => {
  const child = makeFakeChild();
  t.mock.method(cp, 'spawn', () => child);
  stream.start('http://x/s');
  stream.stop();
  await tick(2);
  assert.equal(stream.getStatus().status, 'stopped');
});

test('U2.T4: restart cycles stopped to connecting to playing', async (t) => {
  const children = [];
  t.mock.method(cp, 'spawn', () => {
    const c = makeFakeChild();
    children.push(c);
    return c;
  });
  stream.start('http://x/s');
  await tick();
  children[0].stderr.write('Stream #0:0: Audio:\n');
  await tick();
  assert.equal(stream.getStatus().status, 'playing');
  stream.restart();
  await tick(3);
  assert.equal(children.length, 2);
  assert.equal(stream.getStatus().status, 'connecting');
  children[1].stderr.write('Stream #0:0: Audio:\n');
  await tick();
  assert.equal(stream.getStatus().status, 'playing');
});

test('U2.T5: pause kills process and sets status to paused', async (t) => {
  const child = makeFakeChild();
  t.mock.method(cp, 'spawn', () => child);
  stream.start('http://x/s');
  child.stderr.write('Stream #0:0: Audio:\n');
  await tick();
  stream.pause();
  await tick(2);
  assert.equal(stream.getStatus().status, 'paused');
  assert.equal(child.killed, true);
});

test('U2.T6: resume after pause re-spawns against same url', async (t) => {
  const children = [];
  t.mock.method(cp, 'spawn', (_cmd, args) => {
    const c = makeFakeChild();
    c._url = args[args.length - 1];
    children.push(c);
    return c;
  });
  stream.start('http://x/s');
  await tick();
  children[0].stderr.write('Stream #0:0: Audio:\n');
  await tick();
  stream.pause();
  await tick(2);
  assert.equal(stream.getStatus().status, 'paused');
  stream.resume();
  await tick();
  assert.equal(children.length, 2);
  assert.equal(children[1]._url, 'http://x/s');
  assert.equal(stream.getStatus().status, 'connecting');
});

test('U2.T7: error line sets error; subsequent exit does not flip to stopped', async (t) => {
  const child = makeFakeChild();
  t.mock.method(cp, 'spawn', () => child);
  stream.start('http://x/s');
  child.stderr.write('Connection refused\n');
  await tick();
  assert.equal(stream.getStatus().status, 'error');
  child.emit('exit', 1, null);
  await tick();
  assert.equal(stream.getStatus().status, 'error');
});

test('U2.T8: unexpected exit sets status to error', async (t) => {
  const child = makeFakeChild();
  t.mock.method(cp, 'spawn', () => child);
  stream.start('http://x/s');
  child.stderr.write('Stream #0:0: Audio:\n');
  await tick();
  assert.equal(stream.getStatus().status, 'playing');
  child.emit('exit', 1, null);
  await tick();
  assert.equal(stream.getStatus().status, 'error');
});

test('U2.T9: start while already running is a no-op', async (t) => {
  const spawnFake = t.mock.method(cp, 'spawn', () => makeFakeChild());
  stream.start('http://x/s');
  stream.start('http://x/s');
  stream.start('http://other');
  assert.equal(spawnFake.mock.calls.length, 1);
});

test('U2.T10: pause while stopped is a no-op', async (t) => {
  const spawnFake = t.mock.method(cp, 'spawn', () => makeFakeChild());
  stream.pause();
  assert.equal(stream.getStatus().status, 'stopped');
  assert.equal(spawnFake.mock.calls.length, 0);
});

test('setStation restarts the player against the new url', async (t) => {
  const children = [];
  t.mock.method(cp, 'spawn', (_cmd, args) => {
    const c = makeFakeChild();
    c._url = args[args.length - 1];
    children.push(c);
    return c;
  });
  stream.start('http://first');
  await tick();
  stream.setStation({ streamUrl: 'http://second' });
  await tick(3);
  assert.equal(children.length, 2);
  assert.equal(children[1]._url, 'http://second');
});

test('setStation from stopped state starts the player', async (t) => {
  const children = [];
  t.mock.method(cp, 'spawn', (_cmd, args) => {
    const c = makeFakeChild();
    c._url = args[args.length - 1];
    children.push(c);
    return c;
  });
  stream.setStation({ streamUrl: 'http://first' });
  await tick();
  assert.equal(children.length, 1);
  assert.equal(children[0]._url, 'http://first');
  assert.equal(stream.getStatus().status, 'connecting');
});

test('U2.T11: "No more combinations to try" sets errorMessage to No audio device', async (t) => {
  const child = makeFakeChild();
  t.mock.method(cp, 'spawn', () => child);
  stream.start('http://x/s');
  child.stderr.write('No more combinations to try, audio open failed\n');
  await tick();
  const s = stream.getStatus();
  assert.equal(s.status, 'error');
  assert.equal(s.errorMessage, 'No audio device');
});

test('U2.T12: "Connection refused" sets errorMessage to Stream unreachable', async (t) => {
  const child = makeFakeChild();
  t.mock.method(cp, 'spawn', () => child);
  stream.start('http://x/s');
  child.stderr.write('Connection refused\n');
  await tick();
  const s = stream.getStatus();
  assert.equal(s.status, 'error');
  assert.equal(s.errorMessage, 'Stream unreachable');
});

test('U2.T13: errorMessage resets to null on restart after error', async (t) => {
  const children = [];
  t.mock.method(cp, 'spawn', () => {
    const c = makeFakeChild();
    children.push(c);
    return c;
  });
  stream.start('http://x/s');
  children[0].stderr.write('No more combinations to try\n');
  await tick();
  assert.equal(stream.getStatus().errorMessage, 'No audio device');
  // Restart: kill old proc, spawn new one
  stream.restart();
  await tick(3);
  assert.equal(stream.getStatus().errorMessage, null);
});

test('U2.T14: unexpected exit sets error with null errorMessage', async (t) => {
  const child = makeFakeChild();
  t.mock.method(cp, 'spawn', () => child);
  stream.start('http://x/s');
  child.stderr.write('Stream #0:0: Audio:\n');
  await tick();
  child.emit('exit', 1, null);
  await tick();
  const s = stream.getStatus();
  assert.equal(s.status, 'error');
  assert.equal(s.errorMessage, null);
});
