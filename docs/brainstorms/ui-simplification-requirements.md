---
date: 2026-05-24
topic: ui-simplification
---

# UI Simplification

## Summary

Strip the radio controller page down to a functional operator surface: remove the
header entirely, flatten the four control column sections into ruled panels, simplify
the service row to three clearly-named buttons, and fix the volume slider fill bug.
The station card simplification is captured separately in
`docs/brainstorms/station-card-simplification-requirements.md`.

---

## Problem Frame

The current layout nests six card boxes inside an outer card — the app shell, then
four control panels, the station card, and the level meter each add the same
`background / border / border-radius` treatment. Nothing stands out because everything
is equally framed. The header dedicates ~80px to branding on a page opened as a
functional tool, not a landing page. The service row presents five identically-weighted
buttons including a destructive device reboot. "Restart" versus "Reboot Pi" reads as
synonyms to anyone who hasn't read the source.

---

## Changes

### 1. Remove the header

Remove `app-header`, `.app-mark`, and `.app-wordmark` entirely from `src/App.tsx`
and `src/App.css`. The skull mark already appears in the station card's placeholder
state; the page needs no separate identity treatment.

The `app-error` banner (shown on connectivity loss) moves to sit above the main grid,
or is absorbed into the connection status indicator in the monitor column footer.

### 2. Flatten the control column sections

Remove card treatment (background, border, border-radius) from:
- `src/components/Playback.css`
- `src/components/StreamRow.css`
- `src/components/Presets.css`
- `src/components/ServiceRow.css`
- `src/components/LevelMeter.css`

Replace with flush `padding: 0.95rem 0` (horizontal padding drops to zero — content
aligns with the app shell's own padding). Add hairline `border-top` separators between
adjacent sections in the control column via a sibling selector in
`src/components/ControlColumn.css`.

The station card keeps its card treatment — it is the one genuine card on the page
(wraps artwork and metadata into a visually discrete unit).

### 3. Simplify the service row

Drop the `Stop` and `Start` buttons. `Restart stream` covers the common fix case
(kill and relaunch the audio pipeline). Rename for clarity:

| Old label | New label | What it does |
|---|---|---|
| Restart | Restart stream | Kills and relaunches `ffplay` |
| Reboot Pi | Reboot device | Full OS reboot |
| Logs | Logs | No change |
| Stop | *(removed)* | — |
| Start | *(removed)* | — |

The `confirm-tap` (double-tap to confirm) pattern stays on `Reboot device` — it is
still the destructive action.

### 4. Remove emoji from button labels

Strip platform-emoji prefixes from all button labels in `src/components/Playback.tsx`:

| Old | New |
|---|---|
| `▶ Play` | `Play` |
| `❚❚ Pause` | `Pause` |
| `🔊 Mute` | `Mute` |
| `🔇 Unmute` | `Unmute` |

### 5. Fix volume slider fill

The `.volume-slider` CSS uses `var(--p, 50%)` to fill the track gradient, but nothing
in `Playback.tsx` sets `--p` on the element. The gradient is stuck at 50% regardless
of actual volume.

Fix: pass `style={{ '--p': `${draft}%` } as React.CSSProperties}` on the `<input>`
element so the fill tracks the slider handle in real time.

---

## Final Layout (ASCII)

```
┌─ app shell ──────────────────────────────────────────────────────┐
│                                                                  │
│  ┌─ monitor col ────────────┐  [Play]  [Mute]                   │
│  │ ┌─ station card ───────┐ │  ── vol slider ──────────  80%    │
│  │ │ [art]  Name          │ │                                    │
│  │ │        ● On air · N  │ │  ──────────────────────────────── │
│  │ │        Host          │ │  Station URL or slug               │
│  │ └──────────────────────┘ │  [_____________________] [Apply]  │
│  │                          │                                    │
│  │  Levels          L · R   │  ──────────────────────────────── │
│  │  ████████░░░░░░░░░░░░░   │  Presets                     [+]  │
│  │  █████░░░░░░░░░░░░░░░░   │  [Nosara ×]  [Kingston ×]        │
│  │                          │                                    │
│  │  ● Playing  /stream/…    │  ──────────────────────────────── │
│  └──────────────────────────┘  [Restart stream]  [Reboot device]│
│                                [Logs]                            │
└──────────────────────────────────────────────────────────────────┘
```

Mobile (stacked, monitor first):
```
┌─ app shell ─────────────────────────────┐
│ ┌─ station card ──────────────────────┐ │
│ │ [art]  Name                         │ │
│ │        ● On air · N                 │ │
│ └─────────────────────────────────────┘ │
│  Levels                         L · R   │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│  █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│  ● Playing  /stream/…                   │
│ ──────────────────────────────────────  │
│  [Play]  [Mute]                         │
│  ── vol slider ──────────────────  80%  │
│ ──────────────────────────────────────  │
│  Station URL or slug                    │
│  [_____________________________][Apply] │
│ ──────────────────────────────────────  │
│  Presets                           [+]  │
│  [Nosara ×]  [Kingston ×]               │
│ ──────────────────────────────────────  │
│  [Restart stream] [Reboot device][Logs] │
└─────────────────────────────────────────┘
```

---

## Files Affected

| File | Change |
|---|---|
| `src/App.tsx` | Remove `app-header`, `app-mark`, `app-wordmark`; relocate or remove error banner |
| `src/App.css` | Remove `.app-header`, `.app-mark`, `.app-wordmark` rules |
| `src/components/ControlColumn.css` | Add `gap: 0` + sibling `border-top` divider rule |
| `src/components/Playback.tsx` | Remove emojis from button labels; add `--p` inline style to slider |
| `src/components/Playback.css` | Strip card treatment; change padding to `0.95rem 0` |
| `src/components/StreamRow.css` | Strip card treatment; change padding to `0.95rem 0` |
| `src/components/Presets.css` | Strip card treatment; change padding to `0.95rem 0` |
| `src/components/ServiceRow.tsx` | Remove Stop + Start buttons; rename Restart → "Restart stream", Reboot Pi → "Reboot device" |
| `src/components/ServiceRow.css` | Strip card treatment; change padding to `0.95rem 0` |
| `src/components/LevelMeter.css` | Strip card treatment; padding flush to column |

---

## Scope Boundaries

- No layout restructuring (two columns stay; mobile stacking stays)
- No new animations or motion work
- No changes to API, server, or types
- Station card content changes are covered in `docs/brainstorms/station-card-simplification-requirements.md`
- `LogsPanel` modal and `StatusIndicator` are unchanged

---

## Acceptance Criteria

- The rendered page has no visible header (skull mark, wordmark)
- The control column sections have no background fill, border, or border-radius of their own
- Hairline rules visually separate Playback / Stream / Presets / Service sections
- Service row renders exactly three buttons: Restart stream, Reboot device, Logs
- No emoji characters appear in any button label
- Volume slider fill tracks the handle position as it is dragged
- All existing functionality (play/pause, mute, volume, station set, presets, reboot,
  logs, confirm-tap on Reboot device) continues to work
