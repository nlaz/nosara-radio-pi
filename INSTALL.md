# Install on a fresh Raspberry Pi

Tested on Raspberry Pi OS (Debian Trixie, aarch64).

## 1. System dependencies

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg avahi-daemon
```

Avahi enables `radio.local` hostname resolution on the local network.

## 2. Set the hostname to `radio`

```bash
sudo hostnamectl set-hostname radio
```

Restart Avahi to pick up the new hostname:

```bash
sudo systemctl restart avahi-daemon
```

`radio.local` will now resolve on the local network.

## 3. Configure audio output

List available playback devices:

```bash
aplay -l
```

If the Pi has both HDMI and a 3.5mm jack, force output to the headphone jack:

```bash
sudo raspi-config
# Advanced Options → Audio → Force 3.5mm jack
```

Or set it directly:

```bash
amixer cset numid=3 1   # 1 = headphone jack, 2 = HDMI
```

Test that audio works before continuing:

```bash
speaker-test -t wav -c 2
```

## 4. Install Node.js via nvm

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
node --version
/usr/local/bin/node --version
```

## 5. Clone the repo

Replace `pi` with your actual username if different.

```bash
git clone https://github.com/nlaz/nosara-radio-pi.git ~/radio
cd ~/radio
npm install
```

## 6. Update the service file

Open `radio-web.service` and replace `USER` with your username:

```bash
sed -i "s|/home/USER/|/home/$USER/|g" ~/radio/radio-web.service
```

Verify the paths look correct:

```bash
cat ~/radio/radio-web.service
```

## 7. Install and enable the systemd service

```bash
sudo cp ~/radio/radio-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable radio-web
sudo systemctl start radio-web
```

## 8. Verify

```bash
sudo systemctl status radio-web
```

You should see `active (running)` with two processes: the Node.js web server and ffplay.

Open `http://radio.local` from any device on the local network to confirm the UI loads.

## Troubleshooting

**`radio.local` doesn't resolve**
Confirm Avahi is running: `systemctl is-active avahi-daemon`. On Windows, install Bonjour or an mDNS client.

**No audio from speaker**
Check the audio output device is configured correctly (step 3). The service sets `SDL_AUDIODRIVER=alsa` to bypass PulseAudio when running as root.

**Status shows Error immediately**
The default stream URL may not be broadcasting yet. Paste a different stream URL in the web UI and press Apply, or wait for the scheduled broadcast.

**Service fails to start**
Check logs: `journalctl -u radio-web -n 50`. Common cause: `/usr/local/bin/node` symlink is missing (re-run step 4) or paths in the service file still contain `USER` (re-run step 6).
