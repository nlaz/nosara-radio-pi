---
date: 2026-05-24
topic: station-card-simplification
---

# Station Card Simplification

## Summary

Strip the StationCard of three categories of noise: redundant section labels, freshness
timestamps, and pill-pair status indicators. Replace the pills with a single dot-prefixed
inline line. No structural or sizing changes — the card remains a card, art stays 96×96.

---

## Problem Frame

The current StationCard stacks five sub-items under the station name (label, name, pill
pair, host prefix, freshness) that compete for attention without proportional value.
The "STATION" label is redundant context. The "Synced · 5s ago" line creates the
illusion of live data while the station name is static — it adds motion noise on every
poll cycle. The pill pair ([On air] [42 listening]) uses two visual treatments for one
thought.

---

## Changes

### What is removed

| Element | Reason |
|---|---|
| `STATION` / `DIRECT STREAM` uppercase label | Redundant — the card's position communicates its purpose |
| `Synced · Xs ago` freshness timestamp | Low-value, adds motion noise on every poll |
| `API stale · Xs ago` stale warning | Freshness signaling dropped entirely; last-known data is shown silently |
| `Host ·` prefix text | Prefix-as-label pattern is verbose; host name alone is sufficient |

### What changes shape

| Element | Before | After |
|---|---|---|
| On-air status + listener count | `[On air]` `[42 listening]` pills | `● On air · 42 listening` (dot + inline) |
| Off-air status | `[Off air]` pill | `● Off air` (muted dot) |
| Host attribution | `Host · DJ Name` | `DJ Name` |

### What stays the same

- Card treatment (background, border, border-radius, padding)
- Art size: 96×96px
- Station name typography (1.18rem, 600 weight)
- Empty / unconfigured state: skull placeholder + "Not configured"
- Media (direct-stream) variant: skull placeholder + slug or "Unknown" — label removed

---

## Final Layout (ASCII)

**Station variant — on air:**
```
┌──────────────────────────────────────────────┐
│                                              │
│  ┌──────────┐  Nosara Pirate Radio           │
│  │          │  ● On air · 42 listening       │
│  │  96×96   │  DJ Name                       │
│  │  art     │                                │
│  └──────────┘                                │
│                                              │
└──────────────────────────────────────────────┘
```

**Station variant — off air:**
```
┌──────────────────────────────────────────────┐
│                                              │
│  ┌──────────┐  Nosara Pirate Radio           │
│  │          │  ● Off air                     │
│  │  96×96   │  DJ Name                       │
│  │  art     │                                │
│  └──────────┘                                │
│                                              │
└──────────────────────────────────────────────┘
```

**Station variant — API stale (last-known data shown silently):**
```
┌──────────────────────────────────────────────┐
│                                              │
│  ┌──────────┐  Nosara Pirate Radio           │
│  │          │  ● On air · 42 listening       │  ← last known, no stale indicator
│  │  96×96   │  DJ Name                       │
│  │  art     │                                │
│  └──────────┘                                │
│                                              │
└──────────────────────────────────────────────┘
```

**Media / direct-stream variant:**
```
┌──────────────────────────────────────────────┐
│                                              │
│  ┌──────────┐  OjoE6MYGJ                     │
│  │  skull   │                                │
│  │  (navy)  │                                │
│  └──────────┘                                │
│                                              │
└──────────────────────────────────────────────┘
```

**Empty / unconfigured:**
```
┌──────────────────────────────────────────────┐
│                                              │
│  ┌──────────┐  Not configured                │
│  │  skull   │                                │
│  │  (navy)  │                                │
│  └──────────┘                                │
│                                              │
└──────────────────────────────────────────────┘
```

---

## Dot Color Spec

| State | Dot color |
|---|---|
| On air | `var(--success)` (#2f8c3d) |
| Off air | `var(--muted)` (#5a6f7d) |

No glow, no animation — static dot only. The pulsing animation stays exclusive to
the `StatusIndicator` (bridge connection state).

---

## Scope Boundaries

- Only `src/components/StationCard.tsx` and `src/components/StationCard.css`
- No changes to `StatusIndicator`, `MonitorColumn`, or any other component
- No changes to `AppStatus` types — all displayed fields already exist in `StationData`

---

## Acceptance Criteria

- `STATION`, `DIRECT STREAM`, `Host ·`, `Synced ·`, and `API stale ·` strings
  do not appear anywhere in the rendered output
- On-air state and listener count render on a single line with a dot prefix
- All five layout states (on-air, off-air, stale, media, empty) render without errors
