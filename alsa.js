const cp = require('child_process');

let CARD = process.env.RADIO_ALSA_CARD ?? '0';
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

// ── Device card management ──────────────────────────────────────────────────

/** Return the ALSA card index currently in use. */
function getCard() { return CARD; }

/** Switch to a different ALSA card index. Subsequent amixer calls use this value. */
function setCard(index) { CARD = String(index); }

// ── Device discovery ────────────────────────────────────────────────────────

const APLAY_CARD_RE = /^card (\d+):\s+\S+\s+\[([^\]]+)\]/;

/**
 * Return all ALSA playback hardware devices as `[{ index, name }]`.
 * `index` is the ALSA card number string; `name` is the human-readable label.
 * Resolves to `[]` on any error (e.g. aplay not installed, no devices).
 */
async function listCards() {
  return new Promise((resolve) => {
    cp.execFile('aplay', ['-l'], (err, stdout) => {
      if (err) { resolve([]); return; }
      const cards = [];
      const seen = new Set();
      for (const line of (stdout || '').split('\n')) {
        const m = line.match(APLAY_CARD_RE);
        if (m && !seen.has(m[1])) {
          seen.add(m[1]);
          cards.push({ index: m[1], name: m[2] });
        }
      }
      resolve(cards);
    });
  });
}

/**
 * Find a card whose name contains `namePattern` (case-insensitive).
 * Returns the first match, or `null` if none found.
 */
function findCard(cards, namePattern) {
  if (!namePattern) return null;
  const pat = namePattern.toLowerCase();
  return cards.find((c) => c.name.toLowerCase().includes(pat)) ?? null;
}

/**
 * Poll for an ALSA card whose name matches `namePattern`.
 * Fires `onAppear({ index, name })` when the card transitions absent → present.
 * Fires `onDisappear()` when it transitions present → absent.
 *
 * Options:
 *   intervalMs   — poll interval in ms (default 5 000)
 *   listCardsFn  — override for `listCards` (used in tests)
 *
 * Returns a `stop()` function that cancels polling.
 */
function watchDevice(namePattern, { onAppear, onDisappear, intervalMs = 5_000, listCardsFn } = {}) {
  const _list = listCardsFn || listCards;
  let present = false;

  async function tick() {
    const cards = await _list();
    const found = findCard(cards, namePattern);
    if (found && !present) {
      present = true;
      onAppear?.(found);
    } else if (!found && present) {
      present = false;
      onDisappear?.();
    }
  }

  tick(); // immediate first check
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Reset CARD to the env-configured default. Used in tests. */
function _resetCard() {
  CARD = process.env.RADIO_ALSA_CARD ?? '0';
}

module.exports = {
  getVolume,
  setVolume,
  mute,
  unmute,
  setMuted,
  getCard,
  setCard,
  listCards,
  findCard,
  watchDevice,
  AlsaUnavailable,
  CARD,
  CONTROL,
  _resetCard,
};
