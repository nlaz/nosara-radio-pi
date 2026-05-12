# nosara-radio-pi

Always-on audio bridge for Raspberry Pi. The Pi resolves an Evenings station, plays the live broadcast through the connected speaker, and exposes a single-page operator UI at `http://radio.local` for anyone on the local network.

## What you see at `radio.local`

- **Station card** — artwork, name, host, listener count, and an on-air pill driven by the Evenings public API
- **Live level meter** — stereo peak meter visualizing the source broadcast in real time (Web Audio, no extra dependencies)
- **Bridge status** — playing / connecting / stopped / paused / error, distinct from the station's on-air state
- **Playback controls** — play/pause, volume slider, and mute, all acting on the Pi's actual speaker output
- **Stream URL or slug** — paste an Evenings station URL (`evenings.fm/<slug>`) or a bare slug; press Apply
- **Presets** — save stations as one-tap chips; the active preset is highlighted
- **Service controls** — Stop, Start, Restart, Reboot Pi (two-tap confirm), and an on-demand Logs viewer

## Input semantics

- `https://evenings.fm/nosara-pirate-radio` → resolved via `api.evenings.co/v1/streams/{slug}/live`; full station card with artwork
- `nosara-pirate-radio` → bare slug, same resolver path
- `https://media.evenings.co/s/elkVE8rA8` → direct media URL fallback; plays without API metadata

## Service management

```bash
sudo systemctl restart radio-web   # restart app and stream
sudo systemctl stop radio-web      # stop everything
sudo systemctl start radio-web     # start after a stop
journalctl -u radio-web -f         # follow live logs
```

## Config

The active station and saved presets live in `radio/config.json`:

```json
{
  "active": "nosara-pirate-radio",
  "presets": [
    { "slug": "nosara-pirate-radio", "label": "Nosara Pirate Radio" }
  ]
}
```

Edit by hand if you prefer, then restart the service. The previous `{ "url": "..." }` shape is auto-migrated on first read.

## Development

```bash
npm install
npm run build      # build the React app into dist/ for production
npm run dev        # Vite dev server with HMR; proxies /api to localhost:8080
npm test           # backend node:test suite (config, evenings, stream, alsa, server)
npm run test:frontend  # Vitest specs for monitor components
```

The Vite proxy targets `http://localhost:8080` by default. For local development you
have two options:

- Run the server on port 8080: `PORT=8080 node server.js`
- Or point the proxy at the production port: `VITE_API_TARGET=http://localhost:80 npm run dev`

For dev against a real Pi running the server on a different host, set the proxy target:

```bash
VITE_API_TARGET=http://radio.local npm run dev
```

## Remote access (optional)

The default install is LAN-only. To reach the controller from any network — phone on cellular, laptop on a different Wi-Fi — set up a Cloudflare Tunnel and a shared PIN. See [INSTALL.md §10](INSTALL.md#10-remote-access-optional) for full setup.

Once enabled:
- `http://radio.local` keeps working on the home LAN with no PIN
- `https://radio.<your-domain>` is reachable from anywhere, gated by `RADIO_PIN`
- A successful PIN entry sets a 7-day session cookie; `RADIO_SESSION_SECRET` (separate from the PIN) signs the cookie
- To rotate the PIN: edit `/etc/radio-web.env` and `sudo systemctl restart radio-web`. The restart invalidates all remote sessions. `systemctl reload` does NOT pick up env-file changes.

## Install

See [INSTALL.md](INSTALL.md) for full setup on a fresh Raspberry Pi.

## Notes

- `radio.local` resolves via mDNS/Avahi — works on macOS, iOS, Linux, and most Android devices. Windows requires Bonjour or an mDNS client.
- Volume is controlled via ALSA on card 0, mixer `Digital` (HiFiBerry default). Override with `RADIO_ALSA_CARD` and `RADIO_ALSA_CONTROL` env vars for other hardware.
- The Evenings API is polled every 10 s with 30 s / 60 s backoff on failures. If the API is unreachable the last-known station data stays visible with an "API stale" sublabel.
- If the resolved `streamUrl` rotates while the bridge is running, the player restarts against the new URL automatically.
- No authentication — open to anyone on the local network.
