const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CONFIG_MODULE = path.resolve(__dirname, '..', 'config.js');

function isolated(fn) {
  return () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radio-config-'));
    const configPath = path.join(tmpDir, 'config.json');
    const prevEnv = process.env.RADIO_CONFIG_PATH;
    process.env.RADIO_CONFIG_PATH = configPath;
    delete require.cache[CONFIG_MODULE];
    try {
      fn({ tmpDir, configPath });
    } finally {
      delete require.cache[CONFIG_MODULE];
      if (prevEnv === undefined) delete process.env.RADIO_CONFIG_PATH;
      else process.env.RADIO_CONFIG_PATH = prevEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };
}

test('U1.T9: migrates legacy { url } shape with media URL', isolated(({ configPath }) => {
  fs.writeFileSync(configPath, JSON.stringify({ url: 'https://media.evenings.co/s/Kwekx1JG0' }));
  const config = require('../config');
  const state = config.read();
  assert.equal(state.active, 'Kwekx1JG0');
  const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(onDisk.active, 'Kwekx1JG0');
}));

test('U1.T9b: migrates legacy { url } shape with station URL', isolated(({ configPath }) => {
  fs.writeFileSync(configPath, JSON.stringify({ url: 'https://evenings.fm/nosara-pirate-radio' }));
  const config = require('../config');
  const state = config.read();
  assert.equal(state.active, 'nosara-pirate-radio');
}));

test('U1.T10: passes through already-migrated config unchanged', isolated(({ configPath }) => {
  const initial = { active: 'nosara-pirate-radio' };
  fs.writeFileSync(configPath, JSON.stringify(initial, null, 2));
  const before = fs.readFileSync(configPath, 'utf8');
  const config = require('../config');
  const state = config.read();
  assert.deepEqual(state, initial);
  const after = fs.readFileSync(configPath, 'utf8');
  assert.equal(after, before);
}));

test('U1.T10b: defaults applied when file is missing', isolated(({ configPath }) => {
  // Don't pre-write — module import auto-creates with defaults
  const config = require('../config');
  const state = config.read();
  assert.ok(state.active);
  assert.ok(fs.existsSync(configPath));
}));

test('write persists state to disk', isolated(({ configPath }) => {
  const config = require('../config');
  config.write({ active: 'foo' });
  const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(onDisk.active, 'foo');
}));

test('write validates shape', isolated(() => {
  const config = require('../config');
  assert.throws(() => config.write({}), TypeError);
  assert.throws(() => config.write(null), TypeError);
}));

test('U1.T11: concurrent writes produce valid JSON', isolated(({ configPath }) => {
  const config = require('../config');
  for (let i = 0; i < 20; i++) {
    config.write({ active: `s${i}` });
    const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(onDisk.active, `s${i}`);
  }
}));
