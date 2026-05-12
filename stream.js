const childProcess = require('child_process');
const readline = require('readline');

const ERROR_PATTERNS = [
  'Connection refused',
  'Connection timed out',
  'Operation timed out',
  'No route to host',
  'Failed to resolve hostname',
  'Input/output error',
  'Invalid data found',
  'HTTP error',
  'Server returned',
  'No such file',
  'No more combinations to try',
];

let status = 'stopped';
let currentStreamUrl = null;
let proc = null;
// What we intend the next exit to mean: 'stop' | 'pause' | null
let intent = null;

function spawnPlayer(url) {
  return childProcess.spawn('ffplay', ['-nodisp', '-loglevel', 'info', url], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

function startInternal(url) {
  if (proc) return;
  currentStreamUrl = url;
  status = 'connecting';
  intent = null;

  proc = spawnPlayer(url);
  const rl = readline.createInterface({ input: proc.stderr });

  rl.on('line', (line) => {
    if (status === 'error' || intent) return;
    if (line.includes('Stream #0:0: Audio:')) {
      status = 'playing';
      return;
    }
    for (const pattern of ERROR_PATTERNS) {
      if (line.includes(pattern)) {
        status = 'error';
        return;
      }
    }
  });

  proc.on('exit', () => {
    rl.close();
    proc = null;
    if (intent === 'stop') status = 'stopped';
    else if (intent === 'pause') status = 'paused';
    else if (status !== 'error') status = 'error';
    intent = null;
  });
}

function killWith(nextIntent, onExit) {
  if (!proc) {
    if (nextIntent === 'stop' && status !== 'stopped') status = 'stopped';
    else if (nextIntent === 'pause' && status !== 'paused' && status !== 'stopped') status = 'paused';
    if (onExit) onExit();
    return;
  }
  intent = nextIntent;
  if (onExit) proc.once('exit', onExit);
  proc.kill('SIGTERM');
}

function start(url) {
  if (!url || typeof url !== 'string') {
    throw new TypeError('stream.start: url is required');
  }
  startInternal(url);
}

function stop(onExit) {
  killWith('stop', onExit);
}

function pause(onExit) {
  if (!proc) {
    // Idle states (stopped/paused/error) are left unchanged — no spawn, no flip.
    if (onExit) onExit();
    return;
  }
  killWith('pause', onExit);
}

function resume() {
  if (proc) return;
  if (!currentStreamUrl) return;
  startInternal(currentStreamUrl);
}

function restart() {
  const url = currentStreamUrl;
  stop(() => { if (url) startInternal(url); });
}

function setStation({ streamUrl } = {}) {
  if (!streamUrl || typeof streamUrl !== 'string') {
    throw new TypeError('stream.setStation: { streamUrl } is required');
  }
  currentStreamUrl = streamUrl;
  if (proc) {
    stop(() => startInternal(streamUrl));
  } else {
    startInternal(streamUrl);
  }
}

function getStatus() {
  return { status, streamUrl: currentStreamUrl };
}

function _resetForTests() {
  status = 'stopped';
  currentStreamUrl = null;
  proc = null;
  intent = null;
}

module.exports = {
  start, stop, pause, resume, restart, setStation, getStatus,
  _resetForTests,
};
