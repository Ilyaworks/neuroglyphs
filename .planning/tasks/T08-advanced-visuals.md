# T08 — Advanced Visuals

**Status:** todo
**Depends on:** T05
**Files to create/modify:**
- `src/visuals/reflections.js` (new — infinite matryoshka mirrors)
- `src/visuals/distortion.js` (new — fisheye bubbles, rubbery warp)
- `src/visuals/mercury.js` (new — flowing/refracting glyph surfaces)
- `src/visuals/echo.js` (new — temporal + flat phantom echoes)
- `src/visuals/post.js` (new — EffectComposer passes)
- `src/main.js` (integrate)
- `.planning/STATE.md`, `.planning/BACKLOG.md` (bookkeeping)

## Goal

Layer the "wow" visual effects on top of the core reactor (T05): infinite
reflections, local distortion, mercury surfaces, temporal echoes, and
post-processing (bloom, fisheye, chromatic aberration). All glyph-based
(INV-2) and music-reactive (INV-5).

## Design

### Infinite Reflections (matryoshka)

- Recursive mirrors: objects contain scaled-down copies of their interior.
- Implemented as a bounded recursive depth (2–4 levels) to stay within
  performance budget.
- Glyph textures on the inner copies so it stays symbol-only.

### Distortion

- Local fisheye "bubbles" in space: shader-driven vertex displacement on a
  region of the world.
- Rubbery warping: smooth spatial warp field (e.g., a few moving control
  points) applied to glyph positions.
- Intensity driven by music (bass = stronger warp).

### Mercury Surfaces

- Glyph surfaces that flow/refract with sound: animated UV offset + fresnel
  rim + specular streaks on glyph geometry.
- "Solid/liquid/gas" phase transitions sync with music sections (T04).

### Echoes

- Temporal echoes: ghost frames 2–3s behind the player (motion-blur ghosting)
  via a feedback buffer or delayed snapshot of the glyph field.
- Echo objects: flat 2D silhouette shadow-phantom behind an object, with delay.

### Post-processing

- `EffectComposer` + `ShaderPass` chain:
  - Bloom (self-illuminating glyph glow).
  - Fisheye (global, subtle; local bubbles handled in distortion).
  - Chromatic aberration (intensity on beat).
- Quality setting (T12) can disable post passes on low-end GPUs.

### API

```js
// src/visuals/post.js
export class PostFX {
  constructor(renderer, scene, camera)
  setQuality(level) → void   // 0..2
  update(dt, music) → void
  dispose() → void
}
```

## Steps

1. Create `src/visuals/post.js` — EffectComposer + bloom + fisheye + chroma.
2. Create `src/visuals/mercury.js` — flowing/refracting glyph surfaces.
3. Create `src/visuals/distortion.js` — fisheye bubbles + warp field.
4. Create `src/visuals/reflections.js` — bounded recursive matryoshka.
5. Create `src/visuals/echo.js` — temporal + phantom echoes.
6. Update `src/main.js`: integrate all, gate by seed params + quality.
7. Manual test: each effect visible, music-reactive, no non-glyph art.
8. Update STATE.md, BACKLOG.md, commit.

## Acceptance Criteria

- [ ] Bloom, fisheye, chromatic aberration render via EffectComposer.
- [ ] Mercury surfaces flow/refract in sync with music.
- [ ] Local fisheye bubbles + rubbery warp respond to bass.
- [ ] Infinite reflections are bounded (≤4 depth) and performant.
- [ ] Temporal echoes (2–3s ghost) and flat phantom echoes render.
- [ ] All effects are glyph-based (INV-2) and music-driven (INV-5).
- [ ] Quality setting can disable heavy passes without breaking render.

## Invariants

- INV-2: all visuals glyph-based (or shader effects on glyph geometry).
- INV-5: music drives all pulsation/reactivity.

## Notes

- These are the most GPU-heavy systems. Keep each effect behind a seed param
  flag and a global quality gate so T11/T12 can tune performance.
- Prefer a single shared post chain; avoid multiple EffectComposer instances.
- Temporal echo via a feedback render target is cheaper than storing frames.