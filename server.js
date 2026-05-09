const express = require('express');
const stream = require('./stream');
const config = require('./config');

const app = express();
app.use(express.json());

// Start the stream on boot using the saved URL
stream.start(config.read());

const STATUS_LABELS = {
  playing: 'Playing',
  connecting: 'Connecting / waiting for broadcast',
  stopped: 'Stopped',
  error: 'Error / unreachable',
};

const STATUS_COLORS = {
  playing: '#22c55e',
  connecting: '#eab308',
  stopped: '#6b7280',
  error: '#ef4444',
};

function renderPage(initialStatus) {
  const label = STATUS_LABELS[initialStatus.status] || initialStatus.status;
  const color = STATUS_COLORS[initialStatus.status] || '#6b7280';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Radio</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .card {
      background: #1e293b;
      border-radius: 12px;
      padding: 2rem;
      width: 100%;
      max-width: 480px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 1.5rem;
      letter-spacing: -0.02em;
    }
    .status-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.75rem;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    #status-label {
      font-size: 0.95rem;
      font-weight: 500;
    }
    label {
      display: block;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-bottom: 0.5rem;
    }
    .url-row {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
    }
    input[type="text"] {
      flex: 1;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      color: #e2e8f0;
      font-size: 0.875rem;
      padding: 0.6rem 0.75rem;
      outline: none;
    }
    input[type="text"]:focus { border-color: #60a5fa; }
    button {
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 600;
      padding: 0.6rem 1rem;
      transition: opacity 0.15s;
      white-space: nowrap;
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-apply { background: #3b82f6; color: #fff; }
    .btn-restart { background: #475569; color: #e2e8f0; width: 100%; padding: 0.75rem; font-size: 0.95rem; }
    .btn-apply:hover:not(:disabled) { background: #2563eb; }
    .btn-restart:hover:not(:disabled) { background: #64748b; }
  </style>
</head>
<body>
<div class="card">
  <h1>Radio</h1>

  <div class="status-row">
    <div class="dot" id="status-dot" style="background:${color}"></div>
    <span id="status-label" aria-live="polite" aria-atomic="true">${label}</span>
  </div>

  <label for="url-input">Stream URL</label>
  <div class="url-row">
    <input type="text" id="url-input" value="${escapeHtml(initialStatus.url)}" autocomplete="off" spellcheck="false">
    <button class="btn-apply" id="btn-apply" onclick="applyUrl()">Apply</button>
  </div>

  <button class="btn-restart" id="btn-restart" onclick="restartStream()">Restart</button>
</div>

<script>
  const STATUS_LABELS = ${JSON.stringify(STATUS_LABELS)};
  const STATUS_COLORS = ${JSON.stringify(STATUS_COLORS)};

  let urlInputDirty = false;
  const urlInput = document.getElementById('url-input');
  urlInput.addEventListener('input', () => { urlInputDirty = true; });
  urlInput.addEventListener('blur', () => {
    // Only clear dirty flag if user didn't change anything from last known value
  });

  function setStatus(status, url) {
    const dot = document.getElementById('status-dot');
    const label = document.getElementById('status-label');
    dot.style.background = STATUS_COLORS[status] || '#6b7280';
    label.textContent = STATUS_LABELS[status] || status;

    // Only update URL input if user isn't actively editing it
    if (!urlInputDirty) {
      urlInput.value = url;
    }
  }

  function setButtonsDisabled(disabled) {
    document.getElementById('btn-apply').disabled = disabled;
    document.getElementById('btn-restart').disabled = disabled;
  }

  async function restartStream() {
    const btn = document.getElementById('btn-restart');
    btn.textContent = 'Restarting…';
    setButtonsDisabled(true);
    try {
      await fetch('/api/restart', { method: 'POST' });
    } finally {
      btn.textContent = 'Restart';
      setButtonsDisabled(false);
    }
  }

  async function applyUrl() {
    const url = urlInput.value.trim();
    if (!url) return;
    const btn = document.getElementById('btn-apply');
    btn.textContent = 'Applying…';
    setButtonsDisabled(true);
    try {
      const res = await fetch('/api/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        urlInputDirty = false;
      }
    } finally {
      btn.textContent = 'Apply';
      setButtonsDisabled(false);
    }
  }

  // Immediate fetch on load to get fresh status, then poll every 3s
  function poll() {
    fetch('/api/status')
      .then(r => r.json())
      .then(data => setStatus(data.status, data.url))
      .catch(() => {});
  }
  poll();
  setInterval(poll, 3000);
</script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

app.get('/', (_req, res) => {
  res.send(renderPage(stream.getStatus()));
});

app.get('/api/status', (_req, res) => {
  res.json(stream.getStatus());
});

app.post('/api/restart', (_req, res) => {
  stream.restart();
  res.json({ ok: true });
});

app.post('/api/url', (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  stream.setUrl(url.trim());
  res.json({ ok: true });
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`Radio controller listening on port ${PORT}`);
});
