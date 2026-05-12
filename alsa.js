const cp = require('child_process');

const CARD = process.env.RADIO_ALSA_CARD ?? '0';
const CONTROL = process.env.RADIO_ALSA_CONTROL ?? 'Digital';

class AlsaUnavailable extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AlsaUnavailable';
    this.cause = cause;
  }
}

function run(args) {
  return new Promise((resolve, reject) => {
    cp.execFile('amixer', args, (err, stdout, stderr) => {
      if (err) {
        reject(new AlsaUnavailable(
          `amixer ${args.join(' ')} failed: ${stderr?.trim() || err.message}`,
          err,
        ));
      } else {
        resolve(stdout);
      }
    });
  });
}

function parseSget(out) {
  const pct = out.match(/\[(\d+)%\]/);
  const state = out.match(/\[(on|off)\]/);
  if (!pct || !state) {
    throw new AlsaUnavailable(`Unexpected amixer output: ${out.slice(0, 200)}`);
  }
  return { percent: Number(pct[1]), muted: state[1] === 'off' };
}

async function getVolume() {
  const out = await run(['-c', CARD, 'sget', CONTROL]);
  return parseSget(out);
}

async function setVolume(percent) {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    throw new TypeError(`alsa.setVolume: percent must be a finite number`);
  }
  if (percent < 0 || percent > 100) {
    throw new RangeError(`alsa.setVolume: percent must be 0-100, got ${percent}`);
  }
  await run(['-c', CARD, 'sset', CONTROL, `${Math.round(percent)}%`]);
  return getVolume();
}

async function mute() {
  await run(['-c', CARD, 'sset', CONTROL, 'mute']);
  return getVolume();
}

async function unmute() {
  await run(['-c', CARD, 'sset', CONTROL, 'unmute']);
  return getVolume();
}

async function setMuted(muted) {
  return muted ? mute() : unmute();
}

module.exports = {
  getVolume,
  setVolume,
  mute,
  unmute,
  setMuted,
  AlsaUnavailable,
  CARD,
  CONTROL,
};
