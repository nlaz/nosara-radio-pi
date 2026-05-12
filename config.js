const fs = require('fs');
const path = require('path');
const { extractSlug } = require('./evenings');

const CONFIG_PATH = process.env.RADIO_CONFIG_PATH || path.join(__dirname, 'config.json');

const DEFAULT_STATE = Object.freeze({
  active: 'nosara-pirate-radio',
  presets: [{ slug: 'nosara-pirate-radio', label: 'Nosara Pirate Radio' }],
});

function defaults() {
  return {
    active: DEFAULT_STATE.active,
    presets: DEFAULT_STATE.presets.map((p) => ({ ...p })),
  };
}

function isNewShape(raw) {
  return raw
    && typeof raw === 'object'
    && typeof raw.active === 'string'
    && Array.isArray(raw.presets);
}

function migrateFromLegacy(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.url !== 'string') return null;
  let classification;
  try { classification = extractSlug(raw.url); }
  catch { classification = { kind: 'media', slug: raw.url }; }
  const { slug, kind } = classification;
  const label = kind === 'station' ? slug : 'Imported';
  return { active: slug, presets: [{ slug, label }] };
}

function readFromDisk() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return null; }
}

function read() {
  const raw = readFromDisk();
  if (isNewShape(raw)) return raw;
  const migrated = migrateFromLegacy(raw) || defaults();
  write(migrated);
  return migrated;
}

function write(state) {
  if (!state || typeof state.active !== 'string' || !Array.isArray(state.presets)) {
    throw new TypeError('config.write expects { active, presets[] }');
  }
  const data = { active: state.active, presets: state.presets };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2) + '\n');
}

if (!fs.existsSync(CONFIG_PATH)) write(defaults());

module.exports = { read, write, CONFIG_PATH, DEFAULT_STATE };
