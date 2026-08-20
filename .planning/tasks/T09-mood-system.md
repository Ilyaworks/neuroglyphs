# T09 — Mood System

**Status:** todo
**Depends on:** T03
**Files to create/modify:**
- `src/world/mood.js` (new — mood definitions + per-mood params)
- `src/core/glyphs.js` (extend — mood-specific glyph behavior)
- `src/main.js` (integrate mood into world generation)
- `.planning/STATE.md`, `.planning/BACKLOG.md` (bookkeeping)

## Goal

Implement the mood system: each world gets a seeded mood (serene, eerie,
claustrophobic, joyful, void, uncanny) that drives palette, particle
behavior, geometry style, and atmosphere. Moods are the primary way worlds
feel different from each other.

## Design

### Mood Definitions

| Mood | Palette | Geometry | Particles | Atmosphere |
|------|---------|----------|-----------|------------|
| serene | teal/blue/lavender | soft, rounded, slow | sparse, slow drift | warm fog, gentle breathing |
| eerie | red/crimson/black | sharp, angular, broken | dense, fast, erratic | cold fog, torn glyphs |
| claustrophobic | dark, narrow | tight corridors, loops | confined, pressing | thick fog, low ceiling feel |
| joyful | warm yellows/oranges/pinks | bouncy, varied | energetic, bouncy | clear, bright, open |
| void | monochrome (white on black or black on white) | minimal, vast | extremely sparse | deep fog, emptiness |
| uncanny | desaturated, off | almost-real, subtly distorted | normal but wrong | flat light, uncanny stillness |

### Mood → Params Mapping

Each mood maps to a set of parameters consumed by the world generator (T03):
- `palette` (array of colors)
- `geometryStyle` (structure type bias)
- `particleDensity` (float 0..1)
- `particleSpeed` (float 0..1)
- `fogDensity` (float 0..1)
- `fogColor` (color)
- `breathingRate` (float)
- `glyphStyle` (e.g., 'torn', 'clean', 'distorted')
- `atmosphericDensity` ('thick' | 'thin')

### Mood Selection

- Seeded per world (deterministic, INV-3).
- Can be overridden by neuro-prompt (T10) or music mood analysis (T04).
- "Dead" scenarios: frozen particles, synchronized unnatural movement
  (a special mood variant, not a separate system).

### API

```js
// src/world/mood.js
export const MOODS = ['serene', 'eerie', 'claustrophobic', 'joyful', 'void', 'uncanny'];

export function getMoodParams(mood) → MoodParams
export function selectMood(rng) → string
export function applyMood(worldGroup, mood, music) → void
```

### MoodParams

```js
{
  palette: [color, color, ...],
  geometryStyle: string,
  particleDensity: number,
  particleSpeed: number,
  fogDensity: number,
  fogColor: string,
  breathingRate: number,
  glyphStyle: string,
  atmosphericDensity: 'thick' | 'thin'
}
```

## Steps

1. Create `src/world/mood.js` — mood definitions + param mapping.
2. Extend `src/core/glyphs.js` — mood-specific glyph behavior (torn, distorted, frozen).
3. Update `src/main.js`: select mood per world, apply to world generation.
4. Wire mood params into T03 world generator (structure type, particles, fog).
5. Manual test: each mood produces a visually distinct world.
6. Update STATE.md, BACKLOG.md, commit.

## Acceptance Criteria

- [ ] All 6 moods defined with distinct palettes and params.
- [ ] Mood is seeded per world (deterministic).
- [ ] Mood drives palette, geometry style, particle behavior, fog, atmosphere.
- [ ] "Dead" scenario variant works (frozen particles, synchronized movement).
- [ ] Mood can be overridden by neuro-prompt or music analysis.
- [ ] Each mood produces a visually distinct world (manual test).

## Invariants

- INV-2: all visuals glyph-based.
- INV-3: one world = one seed, deterministic (mood is part of seed).
- INV-4: no player death, no fail state (even "scary" moods are safe).
- INV-5: music can influence mood (if no music, seeded mood is default).

## Notes

- Mood is the bridge between the abstract seed and the concrete visual
  experience. It's the primary "flavor" differentiator between worlds.
- Keep mood params in a single source of truth (mood.js) so T03, T05, T08
  all consume the same values.
- "Dead" scenarios are a mood variant, not a separate system — they reuse
  the same param structure with frozen/synchronized particle behavior.