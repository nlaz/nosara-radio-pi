---
date: 2026-05-24
slug: refactor-ui-simplification
status: active
origin:
  - docs/brainstorms/ui-simplification-requirements.md
  - docs/brainstorms/station-card-simplification-requirements.md
---

# refactor: UI Simplification

## Summary

Strip the radio controller page of visual noise accumulated through card-in-card
nesting. Five targeted changes land together: remove the app header entirely, flatten
the four control column sections from boxed cards to ruled panels, simplify the
StationCard content, trim the service row to three clearly-named buttons, and fix a
bug where the volume slider fill is stuck at 50% regardless of actual volume.

No layout restructuring, no server changes, no new dependencies.

---

## Problem Frame

The current layout nests six card boxes inside the outer app-shell card. The header
spends ~80 px on branding for a tool opened repeatedly as an operator console.
The service row exposes five identically-weighted buttons — including a destructive
device reboot — with ambiguous names ("Restart" and "Reboot Pi" read as synonyms).
The volume slider gradient uses a CSS custom property (`--p`) that is never set,
making the fill permanently frozen at 50%. Emoji in button labels render
inconsistently across platforms.

---

## Requirements Trace

| Requirement | Unit |
|---|---|
| Remove header (skull, wordmark) | U2 |
| Flatten Playback, StreamRow, Presets, ServiceRow, LevelMeter | U3 |
| Hairline dividers between control sections | U3 |
| StationCard: remove STATION/DIRECT STREAM labels | U1 |
| StationCard: remove freshness timestamps (synced + stale) | U1 |
| StationCard: replace pills with dot + inline status | U1 |
| StationCard: remove "Host ·" prefix | U1 |
| Service row → Restart stream / Reboot device / Logs | U4 |
| Remove emoji from Play/Pause/Mute/Unmute | U5 |
| Fix volume slider fill (wire `--p` CSS variable) | U5 |

---

## Key Technical Decisions

- **Both requirements docs combine into one plan and one implementation pass.**
  The changes are tightly coupled visually — shipping them separately would leave the
  UI in an intermediate state that looks unfinished.

- **Test updates land in the same unit as the component change (U1).**
  Four of the six existing `StationCard` tests assert on strings that are being
  deliberately removed or restructured. Shipping the component without updating the
  tests would leave the suite broken. The `U6.T4` test ("API stale" assertion) is
  deleted, not updated — it asserts behaviour that has been intentionally eliminated.

- **`app-error` banner moves, not dropped.**
  The connectivity error message currently renders inside `<header>`. With the header
  removed, the banner relocates just above `<main>` so the signal is preserved.

- **`simpleAction` helper in `ServiceRow` is retained for the Restart button.**
  `simpleAction` is called by three buttons in the current component (Stop, Start, and
  Restart), not two. Stop and Start are removed; Restart keeps its `simpleAction` call.
  The helper is not dead code after the change and must not be deleted.

- **LevelMeter card treatment is part of the flatten pass (U3), not a separate unit.**
  Its card chrome is identical in structure and intent to the control column sections.

- **On-air/off-air status text strings stay the same; only the DOM container changes.**
  Tests that assert on "On air" / "Off air" text continue to pass — the text is now
  in an inline `<span>` rather than a pill `<span>`. Tests that assert on `'3 listening'`
  as a separate node must update to match the combined `'On air · 3 listening'` string.

---

## Implementation Units

### U1. StationCard content simplification

**Goal:** Remove section labels, freshness timestamps, and the pill pair from
`StationCard`; replace the pill pair with a single dot-prefixed status line; remove
the "Host ·" prefix. Update tests to match the new rendered structure.

**Requirements:** Station card content from `docs/brainstorms/station-card-simplification-requirements.md`

**Dependencies:** None — isolated component.

**Files:**
- `src/components/StationCard.tsx`
- `src/components/StationCard.css`
- `src/components/__tests__/StationCard.test.tsx`

**Approach:**
- Remove the `<div className="label">` rendered above the station name in all three
  variants (station, media, empty). The "STATION" and "Direct stream" labels disappear.
- Remove the `station-pills` block entirely. Replace with a single `station-status`
  element: a coloured dot `<span>` followed by inline text.
  - On-air: dot colour `var(--success)`, text `On air · N listening` (listener count
    appended with ` · ` separator when `listeners !== null && online`).
  - Off-air: dot colour `var(--muted)`, text `Off air`.
  - Dot is a static `<span>` — no animation, no glow.
- Remove the `station-freshness` div entirely. Neither the "Synced" nor "API stale"
  string should appear in the output regardless of `apiReachable` state.
- Remove the "Host ·" prefix from the host line. Render just the host name in
  `.station-host`.
- In `StationCard.css`: remove `.station-pills`, `.pill`, `.pill-on`, `.pill-off`,
  `.pill-soft` rules. For `.station-freshness`: the current CSS file combines
  `.station-host, .station-freshness` into one shared rule (font-size + color). Remove
  only `.station-freshness` from that selector — do not remove the entire rule or the
  host line loses its typography. Add `.station-status` and `.station-status-dot` rules
  matching the dot spec.

**Test updates (`StationCard.test.tsx`):**
- `U6.T1`: update to assert `screen.getByText('On air · 3 listening')` as a combined
  string; remove separate assertions for `'On air'` and `'3 listening'`.
- `U6.T1b`: `'Off air'` stays asserted; the `/listening/` absence assertion is still valid.
- `U6.T2`: remove the `'Direct stream'` label assertion. Keep the absence-of-pills
  assertion. Keep the `'nosara-pirate-radio'` slug fallback assertion.
- `U6.T4`: **delete this test** — it asserts `/API stale/`, which is intentionally removed
  behaviour. Staleness is now shown silently.
- Host test: update to assert `screen.getByText('DJ Whoever')` (no prefix).
- Null station test: `'Not configured'` assertion is unchanged.

**Test scenarios:**
- On-air station renders a single combined status line (`'On air · 3 listening'`), no
  pill elements, no STATION label, no freshness line.
- Off-air station renders `'Off air'` with no listener count, no STATION label, no
  freshness.
- Station with `apiReachable: false` renders the same as a normal station — no stale
  indicator, no freshness line anywhere in the output.
- Station with a host renders just `'DJ Whoever'` with no "Host ·" prefix text.
- Media-kind station renders no label, no on-air status, slug fallback for name.
- Null station renders `'Not configured'` with no label above it.
- Station with `online: true` and `listeners: null` renders `'On air'` without a
  listener count (no ` · null` or ` · 0` artifact). **Add as a new test case** — no
  existing test covers this combination (the base fixture has `listeners: 3`).

**Verification:** `npm test` passes. Rendered StationCard shows no label, no pills, no
freshness; status is a dot + inline string.

---

### U2. Remove app header

**Goal:** Delete the `<header>` element (skull mark, wordmark) from the page and
relocate the connectivity error banner to just above `<main>`.

**Requirements:** "Remove header entirely" from `docs/brainstorms/ui-simplification-requirements.md`

**Dependencies:** None — isolated to App shell.

**Files:**
- `src/App.tsx`
- `src/App.css`
- `src/components/__tests__/App.test.tsx` *(create)*

**Approach:**
- In `App.tsx`: remove the `<header className="app-header">` block and all its
  children (`app-mark`, `app-wordmark`). Move the `{error && <div className="app-error">}`
  banner to immediately before the `<main className="app-grid">` element, outside
  and above the grid.
- In `App.css`: remove `.app-header`, `.app-mark`, `.app-wordmark` rules.
  Keep `.app-shell`, `.app-grid`, `.app-error` — these remain valid.
- The `app-grid` becomes the first visible element inside `app-shell` on load.

**Test scenarios:**
- No element with `app-header` class, no skull `img`, no wordmark text in rendered output.
- Error banner renders above `<main>` when `error` prop is set; absent when not set.

**Verification:** Page renders with `app-grid` as the first visible content inside the
shell. No skull or "RADIO CONTROL" text visible.

---

### U3. Flatten control column sections

**Goal:** Strip card chrome (background, border, border-radius) from Playback,
StreamRow, Presets, ServiceRow, and LevelMeter. Add hairline `border-top` dividers
between adjacent sections in both columns.

**Requirements:** Flat sections with dividers from `docs/brainstorms/ui-simplification-requirements.md`

**Dependencies:** None — pure CSS.

**Files:**
- `src/components/ControlColumn.css`
- `src/components/MonitorColumn.css`
- `src/components/Playback.css`
- `src/components/StreamRow.css`
- `src/components/Presets.css`
- `src/components/ServiceRow.css`
- `src/components/LevelMeter.css`

**Approach:**
- In each of Playback, StreamRow, Presets, ServiceRow, LevelMeter: remove
  `background`, `border`, and `border-radius` from the component root rule. Change
  `padding: 0.95rem` to `padding: 0.95rem 0` (zero horizontal padding so content
  aligns flush with the app shell's own `1.25rem` padding).
- `LevelMeter` root: also remove the `var(--cream-deep)` background that differs from
  the other sections.
- `ControlColumn.css`: set `gap: 0` on `.control-column`. Add:
  ```
  .control-column > * + * {
    border-top: 1px solid rgba(7, 45, 68, 0.07);
  }
  ```
  This places a hairline rule above every section except the first without requiring
  per-component changes.
- `MonitorColumn.css`: LevelMeter is a child of `.monitor-column`, not
  `.control-column`, so the ControlColumn sibling rule does not reach it. Add a
  matching sibling rule to `MonitorColumn.css`:
  ```
  .monitor-column > * + * {
    border-top: 1px solid rgba(7, 45, 68, 0.07);
  }
  ```
  Also set `gap: 0` on `.monitor-column` (currently `gap: 1rem`). The `StationCard`
  top border is excluded by the `> * + *` rule (it is the first child), which is the
  intended behaviour.
- Input fields, range sliders, preset chips, and buttons within each section keep
  their own backgrounds and borders — only the section *container* loses its card
  chrome.
- `StationCard` is explicitly exempt — its `padding`, `background`, `border`, and
  `border-radius` are unchanged.

**Test expectation:** none — this is a pure CSS visual change with no behavioral impact.
Manual verification: no card borders visible around control sections; hairline dividers
appear between sections.

**Verification:** Visual inspection shows one unified surface in the control column
with hairline separators. Station card retains its card treatment.

---

### U4. Service row simplification

**Goal:** Remove the Stop and Start buttons; rename Restart → "Restart stream" and
Reboot Pi → "Reboot device"; remove the now-unused `simpleAction` helper.

**Requirements:** Service row simplification from `docs/brainstorms/ui-simplification-requirements.md`

**Dependencies:** U3 (card chrome already stripped; `ServiceRow.css` padding adjusted).

**Files:**
- `src/components/ServiceRow.tsx`
- `src/components/__tests__/ServiceRow.test.tsx` *(create)*

**Approach:**
- Remove the two `<button>` elements for Stop and Start (and their `simpleAction`
  calls).
- **Retain the `simpleAction` helper** — the Restart button calls
  `simpleAction(api.restart)` and must continue to do so. Only the Stop and Start
  invocations are removed.
- Rename the Restart button label: `'Restart'` → `'Restart stream'`.
- Rename the Reboot Pi label: `'Reboot Pi'` → `'Reboot device'`. Update the
  `pending` label `'Tap again to reboot'` — the confirm-tap text can stay as-is or
  update to `'Tap again to reboot device'` for consistency; either is acceptable.
- The `useConfirmTap` hook, `rebooting` state, and the two-tap confirmation pattern
  are unchanged.
- The `'Rebooting…'` label stays.

**Test scenarios:**
- No "Stop" or "Start" buttons rendered.
- Button with label "Restart stream" calls `api.restart` when clicked.
- Button with label "Reboot device" shows the confirm-tap pattern: first click shows
  `'Tap again to reboot'` (or updated variant); second click fires the reboot action.
- "Logs" button still opens the logs panel.
- `rebooting` state disables all buttons while true.

**Verification:** Service row renders three buttons. `npm test` passes (server test
coverage of `/api/restart` and `/api/reboot` is unchanged — those tests are in
`test/server.test.js` and hit the API layer, not the component).

---

### U5. Playback button cleanup and volume slider fix

**Goal:** Remove emoji characters from Play/Pause/Mute/Unmute button labels. Fix the
volume slider fill by wiring the `--p` CSS custom property to the `draft` state value.

**Requirements:** Emoji removal and slider fix from `docs/brainstorms/ui-simplification-requirements.md`

**Dependencies:** U3 (card chrome stripped, padding adjusted for context).

**Files:**
- `src/components/Playback.tsx`
- `src/components/__tests__/Playback.test.tsx` *(create)*

**Approach:**
- Change the four button labels:
  - `'▶ Play'` → `'Play'`
  - `'❚❚ Pause'` → `'Pause'`
  - `'🔊 Mute'` → `'Mute'`
  - `'🔇 Unmute'` → `'Unmute'`
- On the `<input type="range">` element, add `style={{ '--p': `${draft}%` } as React.CSSProperties}`.
  This sets the CSS custom property that the `.volume-slider` gradient already reads
  via `var(--p, 50%)`. The gradient fill will now track the slider handle position
  in real time as `draft` updates.

**Test scenarios:**
- Play button renders with label `'Play'` (no `▶` prefix).
- Pause button renders with label `'Pause'` (no `❚❚` prefix) when `bridgeStatus` is
  `'playing'`.
- Mute button renders with label `'Mute'` (no `🔊` prefix) when `audio.muted` is false.
- Unmute button renders with label `'Unmute'` (no `🔇` prefix) when `audio.muted` is true.
- Volume slider `<input>` has `style` attribute with `--p` set to `'80%'` when
  `audio.percent` is 80.
- Volume slider `<input>` has `--p` set to `'0%'` when `audio.percent` is 0.

**Verification:** `npm test` passes. Volume slider fill visually tracks the handle on
drag. All four button labels contain no emoji characters.

---

## Scope Boundaries

### In Scope
- `src/App.tsx`, `src/App.css`
- `src/components/StationCard.tsx`, `StationCard.css`, `__tests__/StationCard.test.tsx`
- `src/components/ControlColumn.css`
- `src/components/MonitorColumn.css` *(divider rule for LevelMeter only; MonitorColumn.tsx unchanged)*
- `src/components/Playback.tsx`, `Playback.css`, `__tests__/Playback.test.tsx` *(create)*
- `src/components/StreamRow.css`
- `src/components/Presets.css`
- `src/components/ServiceRow.tsx`, `ServiceRow.css`, `__tests__/ServiceRow.test.tsx` *(create)*
- `src/components/LevelMeter.css`
- `src/components/__tests__/App.test.tsx` *(create)*

### Not In Scope
- `src/components/LogsPanel.tsx` / `.css` — no changes
- `src/components/StatusIndicator.tsx` / `.css` — no changes
- `src/components/MonitorColumn.tsx` — no TSX changes
- `src/hooks/` — no changes
- `server.js`, `alsa.js`, `stream.js`, `config.js` — no server changes
- `test/` — Node test suite unchanged; these are server/API tests unaffected by UI
- Mobile layout — no deliberate breakpoint changes; the two-column collapse at 760 px
  is unchanged and will naturally improve from the header removal

### Deferred to Follow-Up Work
- Capture a `docs/solutions/` learning entry for the CSS custom property inline-style
  cast pattern (`style={{ '--p': ... } as React.CSSProperties}`) — the repo has no
  formal learnings database yet and this pattern is worth preserving.
- `Presets.css` — the add-form `preset-add-form input` fields lack a `:focus` border
  colour state (noticed during audit; consistent with the existing `#station-input:focus`
  rule pattern). Minor polish, not part of this simplification.

---

## Dependencies / Assumptions

- Vitest + @testing-library/react test suite remains the standard for component tests.
  The `npm test` script runs Vitest in the existing configuration.
- `var(--success)` (`#2f8c3d`) and `var(--muted)` (`#5a6f7d`) are already defined in
  `src/theme.css` and available for the on-air dot.
- The `--p` CSS custom property is component-scoped to `.volume-slider` in
  `Playback.css` and is not used elsewhere; the inline style approach is safe.

---

## Deferred Implementation Notes

- Exact CSS selector specificity for the `.control-column > * + *` border rule should
  be validated against any future section that should not receive a top border (e.g.,
  an error banner inserted programmatically). Adjust the selector if needed at
  implementation time.
- If the `app-error` banner placement above `<main>` visually interferes with the
  top of the grid on small screens, a minor margin or padding adjustment may be needed
  at implementation time.
