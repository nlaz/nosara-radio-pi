const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.RADIO_CONFIG_PATH || path.join(__dirname, 'config.json');

const DEFAULT_STATE = Object.freeze({
  active: 'nosara-pirate-radio',
});

function defaults() {
  return { active: DEFAULT_STATE.active };
}

function isNewShape(raw) {
  return raw
    && typeof raw === 'object'
    && typeof raw.active === 'string';
}

function migrateFromLegacy(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.url !== 'string') return null;
  const { extractSlug } = require('./evenings');
  let classification;
  try { classification = extractSlug(raw.url); }
  catch { classification = { kind: 'media', slug: raw.url }; }
  return { active: classification.slug };
}

function readFromDisk() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return null; }
}

function read() {
  const raw = readFromDisk();
  if (isNewShape(raw)) return { active: raw.active };
  const migrated = migrateFromLegacy(raw) || defaults();
  write(migrated);
  return migrated;
}

function write(state) {
  if (!state || typeof state.active !== 'string') {
    throw new TypeError('config.write expects { active }');
  }
  const data = { active: state.active };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2) + '\n');
}

if (!fs.existsSync(CONFIG_PATH)) write(defaults());

module.exports = { read, write, CONFIG_PATH, DEFAULT_STATE };
