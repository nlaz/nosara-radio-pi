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

## 10. Remote access (optional)

By default the controller is reachable only on the home LAN at `http://radio.local`. To reach it from another network — a phone on cellular, a laptop on a different Wi-Fi — set up two things: a shared PIN that gates remote access, and a Cloudflare Tunnel that exposes the Pi at `https://radio.<your-domain>` without port forwarding. LAN access at `radio.local` keeps working with no PIN.

### 10a. Set the PIN and session secret

The service reads two secrets from `/etc/radio-web.env`:

- `RADIO_PIN` — the shared passcode anyone reaching the public URL must enter
- `RADIO_SESSION_SECRET` — a long random string used to sign session cookies (separate from the PIN so a leaked cookie cannot be brute-forced back to your PIN)

Create the file with restrictive permissions:

```bash
sudo install -m 0600 -o root -g root /dev/null /etc/radio-web.env
sudo nano /etc/radio-web.env
```

Add exactly these two lines (no inline comments, no leading whitespace, no DOS line endings):

```
RADIO_PIN=puravida
RADIO_SESSION_SECRET=replace-with-32-random-bytes
```

Generate a strong session secret with:

```bash
openssl rand -hex 32
```

Restart the service so the new env file is picked up:

```bash
sudo systemctl restart radio-web
```

**Ordering note:** if you start the service before creating `/etc/radio-web.env`, LAN access works but every tunneled request returns 503 `auth not configured` until you create the file *and* restart. `systemctl reload` does NOT re-read env files — it must be `restart`.

**To rotate the PIN later** (suspected leak, periodic refresh):

```bash
sudo nano /etc/radio-web.env       # edit RADIO_PIN
sudo systemctl restart radio-web   # restart — reload won't pick up env changes
```

The restart invalidates every active remote session: any device that was logged in must re-enter the new PIN.

### 10b. Set up Cloudflare Tunnel

The tunnel runs as its own systemd service alongside `radio-web` and connects outbound to Cloudflare's edge — no port forwarding, no exposed home IP, free tier sufficient. If the tunnel goes down, LAN access keeps working.

Prerequisites: a domain you own whose DNS is managed by Cloudflare (or can be moved there).

```bash
# Install cloudflared (ARM64 .deb for Raspberry Pi 4/5)
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared.deb

# Authenticate (opens a browser for the Cloudflare account login)
cloudflared tunnel login

# Create the tunnel (writes credentials to ~/.cloudflared/<tunnel-id>.json)
cloudflared tunnel create radio

# Route the public hostname at Cloudflare's DNS
cloudflared tunnel route dns radio radio.<your-domain>
```

Create `/etc/cloudflared/config.yml` (replace `<tunnel-id>` and `<your-domain>`):

```yaml
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/<tunnel-id>.json
ingress:
  - hostname: radio.<your-domain>
    service: http://localhost:80
  - service: http_status:404
```

The trailing `http_status:404` catch-all ingress rule is **required** — cloudflared refuses to start without it.

Move the credentials file under root ownership and install the service:

```bash
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/<tunnel-id>.json /etc/cloudflared/
sudo chown -R root:root /etc/cloudflared
sudo cloudflared service install
```

Verify:

```bash
systemctl is-active cloudflared                                          # → active
curl -sS -o /dev/null -w '%{http_code}\n' https://radio.<your-domain>/login   # → 200
```

A successful login from a phone on cellular should:

1. Open `https://radio.<your-domain>` in any browser
2. Land on the PIN entry page
3. After entering the correct PIN, redirect to the main controller UI
4. Future visits skip the PIN entry for 7 days (until you rotate the PIN or clear cookies)

### 10c. LAN trust assumption (read before sharing your Wi-Fi password)

The PIN gate only applies to traffic arriving through the tunnel. Any device on your home Wi-Fi can still reach `http://radio.local` without a PIN — including houseguests you gave the Wi-Fi password to, family members, and smart-home devices. This matches the existing LAN behavior; the remote-access feature does not lock it down.

If your network composition changes (regular houseguests, multi-tenant Wi-Fi, untrusted IoT devices), one option is to firewall port 80 to loopback + your home subnet so the unauthenticated LAN path is closed at the network layer:

```bash
# Adjust 192.168.1.0/24 to match your LAN subnet
sudo ufw allow from 127.0.0.1 to any port 80
sudo ufw allow from 192.168.1.0/24 to any port 80
sudo ufw deny 80
sudo ufw enable
```

The cloudflared tunnel connects from `127.0.0.1` so it stays allowed; remote internet traffic that tries to reach port 80 directly is blocked, and the only public path becomes the auth-gated tunnel.

## 11. Remote SSH via Tailscale (optional)

Tailscale gives you a private, encrypted network between your devices. Once installed, you can `ssh bailey@radio` from anywhere — phone on cellular, laptop on a different Wi-Fi — with no port forwarding and no public SSH exposure.

### Install Tailscale

```bash
# Add the Tailscale apt repository
curl -fsSL https://pkgs.tailscale.com/stable/debian/trixie.noarmor.gpg \
  | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL https://pkgs.tailscale.com/stable/debian/trixie.tailscale-keyring.list \
  | sudo tee /etc/apt/sources.list.d/tailscale.list

sudo apt-get update
sudo apt-get install -y tailscale
```

If your OS codename is not `trixie`, replace it in both URLs. Check with `lsb_release -cs`.

### Bring Tailscale up

```bash
sudo tailscale up --ssh --hostname=radio --operator=$USER
```

`--ssh` enables Tailscale SSH intercept (requires an `ssh` block in your tailnet ACL — see below).
`--hostname=radio` gives the Pi a stable MagicDNS name across re-provisioning.
`--operator=$USER` lets your local user manage Tailscale without sudo.

The command will print an auth URL; open it in a browser and sign in to your Tailscale account (Google, GitHub, Apple, email). The command returns once the device is authorized.

### Enable Tailscale SSH in your tailnet ACL (optional but recommended)

Tailscale SSH allows authentication via tailnet identity — no SSH keys or passwords needed. To enable it, add an `ssh` block to your tailnet ACL at [https://login.tailscale.com/admin/acls](https://login.tailscale.com/admin/acls):

```json
"ssh": [
  {
    "action": "accept",
    "src": ["autogroup:member"],
    "dst": ["autogroup:self"],
    "users": ["autogroup:nonroot", "root"]
  }
]
```

This allows every member of your tailnet to SSH into their own devices.

Without the ACL block, standard SSH still works — Tailscale provides the network path and sshd handles auth via password or `~/.ssh/authorized_keys`.

### Add your SSH public key (if not using Tailscale SSH)

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
# From your client machine:
ssh-copy-id bailey@radio   # prompts once for password, then passwordless forever
```

### Verify

```bash
# From any device on the tailnet (another laptop, phone on cellular, etc.):
ssh bailey@radio
```

You should land in a shell on the Pi. Check the Pi's tailnet IP and MagicDNS name any time with:

```bash
tailscale status
tailscale ip -4
```

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
