const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const DEFAULT_URL = 'https://media.evenings.co/s/OjoE6MYGJ';

function read() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return data.url || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

function write(url) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ url }, null, 2));
}

// Write default on first run if config.json is absent
if (!fs.existsSync(CONFIG_PATH)) {
  write(DEFAULT_URL);
}

module.exports = { read, write, DEFAULT_URL };
