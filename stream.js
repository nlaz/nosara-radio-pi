const childProcess = require('child_process');
const readline = require('readline');

// Each entry maps an ffplay stderr pattern to the human-readable error cause
// shown in the UI. Earlier entries take priority (first match wins).
const ERROR_PATTERNS = [
  { pattern: 'No more combinations to try', cause: 'No audio device' },
  { pattern: 'Failed to resolve hostname',  cause: 'Cannot resolve hostname' },
  { pattern: 'Connection refused',          cause: 'Stream unreachable' },
  { pattern: 'No route to host',            cause: 'Stream unreachable' },
  { pattern: 'Connection timed out',        cause: 'Connection timed out' },
  { pattern: 'Operation timed out',         cause: 'Connection timed out' },
  { pattern: 'HTTP error',                  cause: 'Stream error' },
  { pattern: 'Server returned',             cause: 'Stream error' },
  { pattern: 'Input/output error',          cause: 'Stream error' },
  { pattern: 'Invalid data found',          cause: 'Stream error' },
  { pattern: 'No such file',               cause: 'Stream error' },
];

let status = 'stopped';
let errorMessage = null;   // human-readable cause of the current 'error' status
let currentStreamUrl = null;
let proc = null;
// What we intend the next exit to mean: 'stop' | 'pause' | null
let intent = null;

function spawnPlayer(url) {
  return childProcess.spawn('ffplay', ['-nodisp', '-loglevel', 'info', '--', url], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

function startInternal(url) {
  if (proc) return;
  currentStreamUrl = url;
  status = 'connecting';
  errorMessage = null;
  intent = null;

  proc = spawnPlayer(url);
  const rl = readline.createInterface({ input: proc.stderr });

  rl.on('line', (line) => {
    if (status === 'error' || intent) return;
    if (line.includes('Stream #0:0: Audio:')) {
      status = 'playing';
      return;
    }
    for (const { pattern, cause } of ERROR_PATTERNS) {
      if (line.includes(pattern)) {
        status = 'error';
        errorMessage = cause;
        return;
      }
    }
  });

  proc.on('exit', () => {
    rl.close();
    proc = null;
    if (intent === 'stop') { status = 'stopped'; errorMessage = null; }
    else if (intent === 'pause') { status = 'paused'; errorMessage = null; }
    else if (status !== 'error') { status = 'error'; errorMessage = null; }
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
  return { status, errorMessage, streamUrl: currentStreamUrl };
}

function _resetForTests() {
  status = 'stopped';
  errorMessage = null;
  currentStreamUrl = null;
  proc = null;
  intent = null;
}

module.exports = {
  start, stop, pause, resume, restart, setStation, getStatus,
  _resetForTests,
};
