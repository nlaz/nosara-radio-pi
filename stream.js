const { spawn } = require('child_process');
const readline = require('readline');
const config = require('./config');

// Error patterns confirmed by live testing on this device
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
let currentUrl = config.read();
let proc = null;
let _stopping = false;

function start(url) {
  if (proc) return;
  currentUrl = url;
  status = 'connecting';
  _stopping = false;

  proc = spawn('ffplay', ['-nodisp', '-loglevel', 'info', url], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  const rl = readline.createInterface({ input: proc.stderr });

  rl.on('line', (line) => {
    if (status === 'error' || _stopping) return;

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

  proc.on('exit', (_code, signal) => {
    rl.close();
    proc = null;

    if (_stopping) {
      status = 'stopped';
      _stopping = false;
    } else if (status !== 'error') {
      // ffplay exited without us killing it and no error was detected in stderr
      // Treat as error so the user knows the stream stopped unexpectedly
      status = 'error';
    }
  });
}

function stop(onExit) {
  if (!proc) {
    if (onExit) onExit();
    return;
  }
  _stopping = true;
  if (onExit) proc.once('exit', onExit);
  proc.kill('SIGTERM');
}

function restart() {
  const url = currentUrl;
  stop(() => start(url));
}

function setUrl(url) {
  config.write(url);
  currentUrl = url;
  stop(() => start(url));
}

function getStatus() {
  return { status, url: currentUrl };
}

module.exports = { start, stop, restart, setUrl, getStatus };
