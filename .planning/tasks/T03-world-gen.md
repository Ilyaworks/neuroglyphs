# T03 — World Generator v1

**Status:** todo
**Depends on:** T02
**Files to create/modify:**
- `src/world/generator.js` (new)
- `src/world/structures.js` (new)
- `src/main.js` (integrate world generator)
- `test/world.test.mjs` (new)

## Goal

Given a decoded seed, generate a complete 3D world made of glyphs:
structure, particles, fog, palette, and exactly ONE rectangular exit.

## Design

### Structure Types (seeded selection from `params.structure`)

| Type | ID | Description |
|------|----|-------------|
| Fractal corridors | 0 | Recursive branching tunnels of glyph walls |
| Non-Euclidean rooms | 1 | Door → same room, different side (loop topology) |
| Crystalline | 2 | Angular glyph formations, sharp geometry |
| Organic | 3 | Flowing, curved glyph architectures |
| Geometric/minimal | 4 | Sparse, clean glyph grids |
| Almost real | 5 | Uncanny valley — recognizable but distorted |
| Void | 6 | Defined by absence — sparse glyphs in darkness |
| Crossed worlds | 7 | Two structures superimposed, interference patterns |

Each type is a function: `(rng, params, scene) → group`.

### World Composition

```
WorldGroup
├── Structure (one of 8 types)
├── Particle field (glyph sprites, density from params.density)
├── Fog (color/density from params.palette + params.density)
├── Background (from params.palette)
├── Exit portal (ALWAYS present, rectangular frame with shaped hole)
└── Anchors (major structural elements that persist across re-seeds)
```

### Exit Portal

- Rectangular frame (4 glyph bars)
- Shaped "hole" in center (circle, triangle, star, etc. — from seed)
- Position: deterministic from rng, always reachable
- Visual: glowing, distinct from structure (INV-6)

### API

```js
// src/world/generator.js
export function generateWorld(decodedSeed, scene) → WorldGroup
export function disposeWorld(worldGroup) → void
export function getExitPosition(worldGroup) → Vector3
```

### Determinism

`generateWorld(decodeSeed("abc123"))` must produce identical geometry each time.
All positions, rotations, scales, colors derived from the seed's rng ONLY.

## Steps

1. Create `src/world/structures.js` — 8 structure generator functions.
   Start with 3 (fractal corridors, crystalline, void) as working implementations;
   stub the rest with simple variations.
2. Create `src/world/generator.js` — compose structure + particles + fog + exit.
3. Create `test/world.test.mjs`:
   - Same seed → same structure type, same exit position, same particle count.
   - All 8 structure types produce a valid group (no errors).
   - Exit always present.
4. Update `src/main.js`: replace existing static glyph field with `generateWorld`.
5. Run `npm test` → all pass.
6. Update STATE.md, BACKLOG.md, commit.

## Acceptance Criteria

- [x] `npm test` passes (world determinism).
- [x] `?seed=abc123` produces a visually distinct world from `?seed=xyz789`.
- [x] Exit portal always present and rectangular.
- [x] 3+ structure types visually distinct (fractal, crystalline, void).
- [x] No `Math.random()` in world generation.
- [x] World renders at ≥ 30fps with 5k+ glyph sprites.

## Invariants

- INV-1: seeded PRNG only.
- INV-2: all visuals glyph-based.
- INV-3: same seed = same world.
- INV-6: exit always rectangular, always findable.