# T05 — Visual Reactor (Music → Visuals)

**Status:** todo
**Depends on:** T03, T04
**Files to create/modify:**
- `src/world/visualReactor.js` (new)
- `src/world/shaders/glyphPulse.js` (new — vertex/fragment shader chunks)
- `src/main.js` (wire reactor into render loop)
- `test/reactor.test.mjs` (new — pure math tests)

## Goal

The world breathes with the music. Every visual parameter is driven by the
audio snapshot from T04. No static lighting, no static motion — everything
pulses, shifts, and evolves with the track.

## Design

### Reactor Responsibilities (per frame, consumes snapshot)

| Parameter | Driven by | Effect |
|-----------|-----------|--------|
| Glyph opacity/scale | `bass` | Glyphs swell on bass hits |
| Rim light intensity | `level` | Edge glow brightens with overall level |
| Color shift | `dominantHz` + `beatPhase` | Hue drifts with pitch, snaps on beat |
| Particle velocity | `mid` | Particles accelerate with mids |
| Fog density | `high` | Highs thin the fog (reveals detail) |
| Camera micro-shake | `beat` | Subtle pulse on beat (configurable, default off) |
| World "breathing" | `beatPhase` | Slow scale oscillation of structure group |
| Spectral projection | `freqData` | Glyph brightness mapped to frequency bins |

### Shader Approach

Use a custom `ShaderMaterial` (or `onBeforeCompile` patch on `PointsMaterial`)
for the glyph particle field:

```glsl
// vertex
uniform float uBass;
uniform float uBeat;
uniform float uTime;
uniform float uBeatPhase;

attribute float aFreqBin;   // 0..1, which frequency bin this glyph maps to
attribute float aRandom;    // 0..1, per-glyph random offset

void main() {
  float pulse = 1.0 + uBass * 0.3 + uBeat * 0.2;
  float breathe = 1.0 + sin(uBeatPhase * 6.2831 + aRandom * 6.2831) * 0.05;
  vec3 pos = position * pulse * breathe;
  // ... standard perspective projection
}

// fragment
uniform float uFreqBin;
uniform float uSpectral;    // 0..1, brightness for this glyph's frequency bin
uniform vec3 uColorShift;

void main() {
  float alpha = texture2D(uMap, vUv).a * (0.4 + uSpectral * 0.6);
  gl_FragColor = vec4(vColor * uColorShift, alpha);
}
```

### API

```js
// src/world/visualReactor.js
export class VisualReactor {
  constructor(worldGroup, musicEngine)
  update(dt) → void        // called per frame after musicEngine.update()
  setEnabled(bool) → void
  dispose() → void
}
```

### Pure Math (testable in Node)

```js
// src/world/visualReactor.js (exported for testing)
export function computePulse(bass, beat) → number
export function computeColorShift(dominantHz, beatPhase, baseHue) → {h, s, l}
export function computeBreathing(beatPhase, random) → number
export function computeSpectral(freqData, binIndex) → number
```

## Steps

1. Create `src/world/shaders/glyphPulse.js` — vertex/fragment shader strings.
2. Create `src/world/visualReactor.js` — pure math functions + class.
3. Create `test/reactor.test.mjs`:
   - `computePulse(0, 0)` → 1.0, `computePulse(1, 1)` → ~1.5.
   - `computeColorShift` returns valid HSL.
   - `computeBreathing` oscillates between 0.95 and 1.05.
   - `computeSpectral` on synthetic freqData → 0..1.
4. Update `src/main.js`: create VisualReactor, call `update(dt)` in render loop.
5. Run `npm test` → all pass.
6. Update STATE.md, BACKLOG.md, commit.

## Acceptance Criteria

- [ ] `npm test` passes (reactor math).
- [ ] Glyphs visibly pulse to bass in a real track.
- [ ] Color shifts with dominant frequency (audible pitch → visible hue).
- [ ] Fog thins on high-frequency content.
- [ ] No visible static elements — everything moves with the music.
- [ ] Reactor can be disabled (for testing / accessibility).

## Invariants

- INV-5: music drives all pulsation/reactivity.
- INV-2: all visuals remain glyph-based.

## Performance Notes

- Reuse the snapshot object (no per-frame allocation).
- Shader uniforms updated in-place, no material recreation.
- `aFreqBin` and `aRandom` are static attributes set at world gen time.