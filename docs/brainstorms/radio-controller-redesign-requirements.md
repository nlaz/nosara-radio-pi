---
date: 2026-05-11
topic: radio-controller-redesign
---

# Radio Controller Redesign

## Summary

Redesign `radio.local` as a split-pane bridge controller. The user enters an Evenings station page URL or slug; the bridge resolves it through the Evenings public API to play the live stream on the Pi. The monitor column carries a live source-stream level meter (centerpiece), station artwork, station name, host, listener count, on-air state, and connection status. The control column carries Pi-speaker playback (pause / volume / mute), URL + presets, and service controls (restart, stop, start, reboot, logs). Visual identity inherits the nosararadio.com palette and skull-mark, with IBM Plex Sans + Mono replacing that site's display fonts.

---

## Problem Frame

The current `radio.local` page is functional but threadbare: a status dot, a URL field, an Apply button, and a Restart button on a generic dark card. It treats the bridge as a black box. The operator can tell *something* is happening from the dot, but not whether broadcast audio is hot or quiet, what station is loaded, whether the station is on-air right now, or how loud the Pi will sound when somebody walks into the room. To adjust volume, stop the stream, switch stations, reboot the Pi, or read logs, the operator has to drop to SSH and `systemctl`. Pasting raw `media.evenings.co/s/<id>` URLs is fragile — there is no way to tell a typo or stale ID from a station that simply isn't broadcasting, and the on-screen status can't distinguish those cases either.

The cost shape is small per incident but constant: every adjustment to the bridge is a context switch out of the browser, and every "is it working?" question requires being physically near the speaker.

---

## Actors

- A1. Operator: The person controlling the bridge from a browser on the same LAN. Single household, single Pi. Owns the device, the stream choice, and the speaker level.
- A2. Bridge: The Node/Express service on the Pi that resolves the station, runs the audio pipeline, controls Pi audio, and exposes the controller UI.
- A3. Evenings API: External service at `api.evenings.co/v1/streams/{slug}/live` that resolves a station slug to a `streamUrl` plus station metadata.
- A4. Pi audio stack: ALSA / system audio that the bridge writes to and adjusts.

---

## Key Flows

- F1. Load and play a station
  - **Trigger:** Operator pastes an Evenings station page URL or slug into the input and presses Apply, OR the bridge boots with a saved station.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** Bridge extracts slug → calls Evenings API → receives `streamUrl`, `name`, `image`, `host`, `listeners`, `online` → persists station selection → starts the audio pipeline against `streamUrl` → UI shows artwork, name, on-air state, and live level meter.
  - **Outcome:** Audio plays through the Pi speaker; the monitor column reflects current station info; the meter shows incoming audio levels.
  - **Covered by:** R1, R2, R3, R5, R8, R9, R10

- F2. Adjust speaker output without leaving the page
  - **Trigger:** Operator wants the room quieter, louder, paused, or silenced.
  - **Actors:** A1, A2, A4
  - **Steps:** Operator moves the volume slider / presses mute / presses pause → bridge changes the Pi's actual audio output → UI reflects the new state.
  - **Outcome:** Pi speaker audio matches what the UI shows. Changes persist across page reloads; they do not affect other listeners' devices because there are none — this is the speaker itself.
  - **Covered by:** R4

- F3. Switch between saved stations
  - **Trigger:** Operator wants to swap stations without retyping a URL.
  - **Actors:** A1, A2, A3
  - **Steps:** Operator picks a saved preset → bridge re-runs F1 against the preset's slug.
  - **Outcome:** New station plays; presets and currently-selected station persist across reboots.
  - **Covered by:** R6, R7

- F4. Operate the bridge service from the page
  - **Trigger:** Operator needs to stop playback, restart, reboot the Pi, or check what the service has been doing.
  - **Actors:** A1, A2
  - **Steps:** Operator presses Stop / Start / Restart / Reboot / Logs → bridge performs the action and reports back.
  - **Outcome:** Service or device is in the requested state; recent log output is visible on demand.
  - **Covered by:** R11, R12, R13

---

## Requirements

**Source resolution**
- R1. The page accepts an Evenings station page URL (e.g., `evenings.fm/nosara-pirate-radio`) or a bare station slug. The bridge extracts the slug.
- R2. The bridge resolves the slug to a stream URL and station data by calling the Evenings public API at `https://api.evenings.co/v1/streams/{slug}/live`. The response provides at minimum `streamUrl`, `name`, `image`, `host`, `online`, and `listeners`.
- R3. Direct `media.evenings.co/s/{id}` URLs are still accepted as a fallback. When used, the bridge plays the stream without station metadata (no name, no artwork, no on-air signal).

**Playback control (Pi speaker)**
- R4. Playback controls — pause/resume, volume slider, mute — change the Pi's actual speaker output, not a browser preview. Volume and mute persist across browser reloads. Pause halts audio without losing the loaded station.

**Stations and presets**
- R5. The active station persists across reboots so the bridge resumes on power-up.
- R6. The operator can save the current station as a preset and switch between presets with one tap.
- R7. Presets store at least the slug and a human-readable label; they persist locally on the Pi.

**Monitoring**
- R8. The monitor column displays a live audio level meter for the incoming source stream as the page's visual centerpiece. The meter is rendered with two channels and a numeric dB-style readout.
- R9. The monitor column displays the resolved station's artwork, name, host (when set), and listener count alongside an on-air / off-air indicator driven by the API's `online` field.
- R10. The monitor column preserves the bridge's existing four-state connection status (playing / connecting / stopped / error) and surfaces it distinctly from the API's on-air state, so a station that is off-air with the bridge still running is visually different from a station that is on-air but the bridge failing to connect.

**Service and device control**
- R11. The control column exposes Stop, Start, and Restart as distinct lifecycle actions for the audio pipeline. Restart is the current "kill and relaunch" behavior; Stop fully halts playback; Start brings it back.
- R12. The control column exposes a "Reboot Pi" action that performs a full system reboot.
- R13. The control column exposes a "Logs" action that surfaces recent service logs on demand (not a continuous live tail).

**Visual identity**
- R14. The page chrome — background, accents, surface colors, and the skull-mark monogram — inherits the nosararadio.com palette and reuses that site's radio-skull SVG.
- R15. Typography is IBM Plex Sans (headings, body, button labels) and IBM Plex Mono (status readouts, meter labels, dB values, identifiers). This is a deliberate departure from nosararadio.com's Chakra Petch + Syne.
- R16. The layout is split: a monitor column on the left (skull mark, meter, station artwork + info, status) and a control column on the right (playback, station + presets, service). On narrow screens the columns stack monitor-first.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R9.** Given the operator pastes `https://evenings.fm/nosara-pirate-radio` and presses Apply, when the bridge resolves the slug, the UI displays "Nosara Pirate Radio", the station artwork from `image`, and the on-air state from `online`; audio begins playing from the returned `streamUrl`.
- AE2. **Covers R3.** Given the operator pastes `https://media.evenings.co/s/elkVE8rA8`, when the bridge processes it, the stream plays but the monitor column shows no station name, no artwork, and no on-air indicator — only the connection status and meter.
- AE3. **Covers R9, R10.** Given the API reports `online: false` while the bridge's connection status is `playing` (audio still flowing from buffered or rotated stream), the monitor column shows "off-air" for the station and "Playing" for the bridge — both distinguishable at a glance.
- AE4. **Covers R10.** Given the Evenings API is unreachable, the monitor column indicates that station data is stale and continues showing the last-known station info; the connection status reflects whatever the audio pipeline is doing independently.
- AE5. **Covers R4.** Given audio is playing through the Pi speaker, when the operator moves the volume slider down, the speaker output gets quieter immediately; when the operator reloads the page, the slider returns to the same level.
- AE6. **Covers R5.** Given the Pi is power-cycled with a saved station, when the bridge boots, it automatically resolves and plays that station without operator input.

---

## Success Criteria

- The operator can answer "is broadcast audio hot or quiet right now?" by glancing at the page from across the room.
- The operator does not need SSH or `systemctl` for routine adjustments — volume, station switching, stop/start/restart/reboot, and reading recent logs are all reachable from the page.
- Pasting a station page URL is the documented happy path; the operator no longer has to know what a media slug is.
- A `ce-plan` pass against this doc can produce an implementation plan without inventing user-facing behavior or scope.

---

## Scope Boundaries

- Browser-side audio playback. The page is a controller, not a listener. Audio plays on the Pi speaker only.
- ICY-tag scraping or any "now playing" track/artist surface. The Evenings API does not expose those fields; we do not synthesize them from elsewhere.
- Multi-station, multi-Pi, or multi-room management. One Pi, one active station.
- Authentication, accounts, or per-user state. LAN-only, single household.
- Cloud sync of presets across devices. Presets live on the Pi.
- Stream recording, archive, or playback of past streams. Evenings.fm already handles this.
- Programming or scheduling UI for upcoming broadcasts.
- A public listener page styled like nosararadio.com. That page lives in a separate project; this controller is internal.
- A new framework or build step. The page stays a single-page vanilla HTML/JS app served by Express.

---

## Key Decisions

- Input is a station page URL or slug, resolved via Evenings API, with direct media URLs accepted as a fallback: Gives the page real station data (name, artwork, host, listener count, on-air state) instead of a black-box stream URL, while keeping current configs working.
- `/live` over `/public` endpoint: Returns the same data plus `type` and `tags` for future use; rate limit (50/min) is more than sufficient for any sensible polling cadence.
- Playback controls target the Pi speaker, not a browser preview: The page exists to control the bridge, not to be an alternative listener. Browser preview was considered and rejected because it splits the mental model of "what is the volume slider doing."
- Split-dashboard layout over a station-card layout: This page is an operator console, not a sibling of the public-facing nosararadio.com. Splitting monitor from controls reads as a control panel and gives the meter the room to be the centerpiece.
- IBM Plex Sans + Mono instead of inheriting nosararadio.com's Chakra Petch + Syne: Deliberate typographic differentiation from the public listener page; Plex Mono carries the status readouts and meter labels.
- API on-air state shown separately from bridge connection status: Two genuinely different signals — a station can be off-air while the bridge plays buffered audio; the bridge can be failing to connect while the API reports the station as live. Collapsing them would hide real failure modes.

---

## Dependencies / Assumptions

- The Evenings public API at `api.evenings.co/v1/streams/{slug}/live` remains anonymous and CORS-enabled. Verified against the live API at brainstorm time (returns `streamUrl`, `name`, `image`, `host`, `online`, `listeners`, plus `tags`, `type`).
- Pi audio is controllable through the OS audio stack (ALSA `amixer` or equivalent) for volume/mute. Specific mechanism deferred to planning.
- The bridge runs as a service with the privileges needed to reboot the host. Exact sudo configuration deferred to planning.
- The current `config.json` shape (a single `url`) will need to extend to carry presets and the saved station; backward compatibility for existing installs is a planning concern.
- The current audio pipeline (`ffplay -nodisp` against the URL) may need to change to support pause/resume and to feed a level extractor. Choice between modifying the pipeline (e.g., inserting level analysis upstream of the player) and analyzing the stream in the browser is deferred to planning.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R8][Technical] Where does the level meter get its data — browser-side analysis of the same `streamUrl`, or Pi-side extraction from the audio pipeline? Both yield "source levels"; trade-off is "only updates when a tab is open" vs "modifies the audio pipeline."
- [Affects R4][Technical] Mechanism for pause/resume — process signal vs stop/restart of the player vs an OS-level audio pause. Affects how fast pause feels.
- [Affects R4][Technical] Volume control mechanism — ALSA `amixer` vs player-side gain. ALSA persists naturally and survives player restarts; player-side gain doesn't.
- [Affects R12][Technical] Sudo configuration required for the service user to reboot the Pi without a password prompt.
- [Affects R13][Technical] Source and tailing strategy for the Logs view (`journalctl` window, in-memory ring buffer, file tail). Affects how far back the operator can see.
- [Affects R2, R9][Technical] API polling cadence and degradation behavior when the API is unreachable (keep playing last-known `streamUrl`, surface staleness in UI).
- [Affects R6, R7][Technical] On-disk shape for presets and the saved station — extend `config.json` vs introduce a separate file.
- [Affects R16][Needs research] Verify IBM Plex Sans + Mono can be served self-hosted from the Pi (Google Fonts is fine if online, but the bridge should still look right on a LAN with no internet).
