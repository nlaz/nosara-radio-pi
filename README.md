# nosara-radio-pi

Always-on audio streaming appliance for Raspberry Pi. The Pi pulls an HTTP MP3 stream and plays it through a connected speaker. Anyone on the local network can open `radio.local` in a browser to restart the stream or switch to a different URL.

## Usage

Open `http://radio.local` from any device on the local network.

- **Status badge** — shows whether the stream is Playing, Connecting, Stopped, or Error
- **Restart** — kills and relaunches the stream process
- **URL field** — paste a new stream URL and press Apply; persists across reboots

## Service management

```bash
sudo systemctl restart radio-web   # restart app and stream
sudo systemctl stop radio-web      # stop everything
sudo systemctl start radio-web     # start after a stop
journalctl -u radio-web -f         # follow live logs
```

## Config

The active stream URL is saved to `radio/config.json`. Edit it directly and restart the service if you prefer not to use the web UI:

```bash
nano ~/radio/config.json
sudo systemctl restart radio-web
```

## Install

See [INSTALL.md](INSTALL.md) for full setup instructions on a fresh Raspberry Pi.

## Notes

- `radio.local` resolves via mDNS/Avahi — works on macOS, iOS, Linux, and most Android devices. Windows requires Bonjour or an mDNS client.
- No volume control — manage audio level at the OS or speaker level.
- No authentication — open to anyone on the local network.
- No automatic stream recovery — use the Restart button if the stream drops.
