# Install on a fresh Raspberry Pi

Tested on Raspberry Pi OS (Debian Trixie, aarch64) with a HiFiBerry DAC+.

## 1. System dependencies

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg alsa-utils avahi-daemon
```

- `ffmpeg` provides `ffplay`, which the bridge uses to play streams.
- `alsa-utils` provides `amixer`, which the bridge uses to control speaker volume and mute.
- `avahi-daemon` enables `radio.local` hostname resolution.

## 2. Set the hostname to `radio`

```bash
sudo hostnamectl set-hostname radio
sudo systemctl restart avahi-daemon
```

`radio.local` will now resolve on the local network.

## 3. Configure audio output

List available playback devices:

```bash
aplay -l
```

The default target is **HiFiBerry DAC+ on card 0**. If `aplay -l` shows the HiFiBerry as card 0 and the mixer control `amixer -c 0 scontrols` lists `Digital`, no further configuration is needed.

If your hardware is different (HDMI, USB DAC, onboard headphone jack), tell the bridge which card and control to use by setting environment variables in the service file (step 8):

```
Environment=RADIO_ALSA_CARD=0
Environment=RADIO_ALSA_CONTROL=Digital
```

Find the right values for your card with:

```bash
amixer -c <N> scontrols   # list controls on card N
amixer -c <N> sget <name> # confirm it supports pvolume and pswitch
```

Test that audio works before continuing:

```bash
speaker-test -t wav -c 2 -D plughw:0
```

## 4. Install Node.js (20 or newer) via nvm

The bridge uses `fetch` and `node:test`, both available in Node 20+.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install --lts
```

Create a stable symlink so systemd can find node without a version-specific path:

```bash
sudo ln -sf "$(which node)" /usr/local/bin/node
```

Verify:

```bash
node --version           # should be 20.x or newer
/usr/local/bin/node --version
```

## 5. Clone the repo and install dependencies

Replace `pi` with your actual username if different.

```bash
git clone https://github.com/nlaz/nosara-radio-pi.git ~/radio
cd ~/radio
npm install
```

## 6. Build the frontend

The page is a Vite + React app that the server serves from `dist/`. Build it before starting the service:

```bash
npm run build
```

This produces `dist/index.html` plus a small JS / CSS bundle and self-hosted IBM Plex font files. Total output is under 300 kB gzipped.

**Re-run `npm run build` whenever you pull frontend changes.** If `dist/` is missing or stale, the page returns a 503 telling you exactly that — it does not silently fall back to the old inline HTML.

## 7. Allow the service to reboot the Pi

The web UI exposes a "Reboot Pi" button. The service needs unprivileged sudo access to `/sbin/reboot` for it to work.

Pick the user the service will run as (matches `User=` in the service file in step 8; defaults to `root` in the shipped file). If you change the service to run as a non-root user, drop a sudoers entry for that user:

```bash
sudo visudo -f /etc/sudoers.d/radio-web
```

```
radio ALL=(root) NOPASSWD: /sbin/reboot
```

Replace `radio` with whichever user `radio-web.service` runs as. Save and exit; `visudo` validates the file before installing it.

If the service runs as `root` (the default in the shipped service file), no sudoers entry is needed — root can already reboot.

## 8. Update and install the service file

Open `radio-web.service` and replace `USER` with your username:

```bash
sed -i "s|/home/USER/|/home/$USER/|g" ~/radio/radio-web.service
```

Verify the paths look correct:

```bash
cat ~/radio/radio-web.service
```

Install and enable:

```bash
sudo cp ~/radio/radio-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable radio-web
sudo systemctl start radio-web
```

## 9. Verify

```bash
sudo systemctl status radio-web
```

Expect `active (running)` with the Node web server (and an `ffplay` child once a station is playing).

Open `http://radio.local` from any device on the local network. You should see:

- The skull-mark monogram and "RADIO CONTROL" wordmark on top
- A monitor column on the left with the active station's artwork, an on-air pill, the live audio level meter, and a connection-status badge
- A control column on the right with play/pause, volume, mute, station URL/slug input, presets, and service controls

## Existing installs: config migration

If you previously ran this app, your `config.json` looks like:

```json
{ "url": "https://media.evenings.co/s/..." }
```

The first time the new server reads it, it auto-migrates to:

```json
{
  "active": "<slug>",
  "presets": [{ "slug": "<slug>", "label": "Imported" }]
}
```

No manual action required. The migration is idempotent and runs only once.

## Troubleshooting

**`radio.local` doesn't resolve.** Confirm Avahi is running: `systemctl is-active avahi-daemon`. On Windows, install Bonjour or an mDNS client.

**No audio from speaker.** Verify the ALSA card and control via `amixer -c <N> sget <name>`. Override `RADIO_ALSA_CARD` and `RADIO_ALSA_CONTROL` in the service file if your hardware differs from HiFiBerry card 0.

**Page returns 503 "Frontend not built".** You skipped step 6, or pulled frontend changes without rebuilding. Run `npm install && npm run build`, then `sudo systemctl restart radio-web`.

**Reboot button does nothing.** Likely a sudoers issue. Run `sudo -u <service-user> sudo -n /sbin/reboot` (replace `<service-user>`) to see the exact error. Most common cause: `User=` in the service file doesn't match the user in `/etc/sudoers.d/radio-web`.

**Status shows Error immediately.** The station is off-air right now, or the stream URL is unreachable. The page distinguishes these: an off-air station shows "Off air" on the station pill while the bridge status reports `error` only if it tried to connect and failed. If the station is on-air but the bridge fails, check `journalctl -u radio-web -n 50` for the ffplay stderr line.

**Service fails to start.** `journalctl -u radio-web -n 50`. Common causes: `/usr/local/bin/node` symlink missing (re-run step 4), paths in the service file still contain `USER` (re-run step 8), or `dist/index.html` missing (re-run step 6).
