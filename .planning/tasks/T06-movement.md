# T06 — Movement & Controls

**Status:** todo
**Depends on:** T03
**Files to create/modify:**
- `src/player/movement.js` (new)
- `src/ui/hud.js` (new — minimal, no text in-world)
- `src/main.js` (integrate movement)

## Goal

Free-fly first-person camera: WASD + mouse look, boost/slow, and a
freeze/inspect mode. No death, no collision damage — only gentle
boundary handling.

## Design

### Controls

| Input | Action |
|-------|--------|
| WASD / arrows | Move (relative to view direction) |
| Mouse (pointer lock) | Look |
| Shift | Boost (×3 speed) |
| Ctrl | Slow-mo (×0.25 speed, time-dilated motion) |
| Space / C | Up / Down |
| F | Toggle freeze/inspect mode |
| Esc | Release pointer lock |
| R | Re-center on nearest structure anchor |

### Freeze/Inspect Mode (F)

- World motion pauses (particles, breathing, shader time).
- Camera still free to look around.
- Glyphs near the camera glow slightly (inspection highlight).
- Music continues (or slows to half speed — configurable).

### Boundary Handling

- No hard walls. Soft "pull-back" force when exceeding world radius
  (world radius derived from seed).
- No falling, no void death (INV-4).

### API

```js
// src/player/movement.js
export class Movement {
  constructor(camera, domElement, worldGroup)
  update(dt) → void
  setFrozen(bool) → void
  getPosition() → Vector3
  dispose() → void
}
```

### HUD (minimal, no in-world text)

- Small corner indicators: boost active, freeze active, speed.
- Glyph-based icons (no text), per INV-8.
- Opacity fades when idle.

## Steps

1. Create `src/player/movement.js` — pointer lock + WASD + boost/slow.
2. Add freeze/inspect mode (F key).
3. Create `src/ui/hud.js` — minimal glyph-based indicators.
4. Update `src/main.js`: create Movement, call `update(dt)`.
5. Manual test: fly around, boost, slow, freeze, re-center.
6. Update STATE.md, BACKLOG.md, commit.

## Acceptance Criteria

- [ ] WASD + mouse look works smoothly (no jitter, no drift).
- [ ] Boost (Shift) and slow-mo (Ctrl) work.
- [ ] Freeze mode (F) pauses world motion, camera still moves.
- [ ] No death/fall — soft boundary pull-back.
- [ ] HUD shows state with glyph icons (no text).
- [ ] Pointer lock UX: click to lock, Esc to release, overlay hint on release.

## Invariants

- INV-4: no player death, no fail state.
- INV-8: no text in-world (HUD uses glyph icons).

## Notes

- Pointer lock is browser-dependent; provide a non-locked fallback
  (drag-to-look) for touch / non-pointer-lock browsers.
- Movement speed and world radius are seed-derived (params.motion).