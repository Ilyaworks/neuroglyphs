# T02 — Seed Engine

**Status:** todo
**Depends on:** T01
**Files to create/modify:**
- `src/core/seed.js` (new)
- `test/seed.test.mjs` (new)
- `src/main.js` (minor: use seed for initial world params)

## Goal

A compact string (8–16 chars) that deterministically produces all world parameters.
Same seed → same world, always.

## Design

### Seed Format

```
[structure][mood][palette][density][fractal][motion][music][nonEuclidean]
  2 chars   1 char  2 chars  1 char   1 char   1 char   2 chars   1 char
```

Total: 11 chars. Alphabet: `0-9a-z` (base36). Each char = 6 bits.

### Parameter Space (per char/group)

| Group        | Bits | Values                                                        |
|--------------|------|---------------------------------------------------------------|
| structure    | 12   | 0–4095 → structure type + sub-variant + complexity            |
| mood         | 6    | 0–63 → mood index (serene/eerie/claustrophobic/joyful/void/uncanny + variants) |
| palette      | 12   | 0–4095 → HSL base hue + saturation + lightness + accent       |
| density      | 6    | 0–63 → particle count multiplier, fog density                 |
| fractal      | 6    | 0–63 → fractal depth, recursion level                         |
| motion       | 6    | 0–63 → movement pattern, speed, breathing rate                |
| music        | 12   | 0–4095 → base tempo, key, scale, instrument type              |
| nonEuclidean | 6    | 0–63 → door loop count, room topology variant                 |

### API

```js
// src/core/seed.js
export function encodeSeed(params) → string
export function decodeSeed(seedString) → { structure, mood, palette, density, fractal, motion, music, nonEuclidean, rng }
export function randomSeed(rng) → string
export function validateSeed(s) → boolean
```

### Determinism Rule

`decodeSeed("abc123xyz")` must always return the same object. The returned `rng`
is a fresh `mulberry32` seeded from the string hash — all downstream generation
uses ONLY this rng (INV-1, INV-3).

## Steps

1. Create `src/core/seed.js` with encode/decode/random/validate.
2. Create `test/seed.test.mjs`:
   - `decodeSeed("test123abc")` twice → deep equal.
   - `validateSeed("!!!!")` → false.
   - `randomSeed` produces valid seeds.
   - Round-trip: `decodeSeed(encodeSeed(params))` → same params.
3. Update `src/main.js`: on load, read seed from `?seed=` URL param or use a
   default; pass decoded params to the existing glyph field.
4. Run `npm test` → all pass.
5. Update STATE.md, BACKLOG.md, commit.

## Acceptance Criteria

- [x] `npm test` passes (seed determinism + round-trip 200x).
- [x] `?seed=abc123xyz` in URL changes the glyph field deterministically.
- [x] No `Math.random()` in `seed.js`.
- [x] Seed string is ≤ 16 chars, only `[0-9a-z]`.

## Implementation Notes (2026-08-20)

- 8 fields packed into 66 bits (12+6+12+6+6+6+12+6) → base36, ≤16 chars.
- `decodeSeed` returns flat params + fresh `mulberry32` rng (deterministic).
- `randomSeed(rng?)` — accepts optional rng for reproducible random seeds.
- `GROUP_MAX` exported for bounds checking.
- `validateSeed(s)` → boolean (regex `^[0-9a-z]{1,16}$`).
- `main.js` reads `?seed=` param, falls back to `neuroglyphs` default.
- Test: `test/seed.test.mjs` — determinism, round-trip 200x, validation, bounds.

## Invariants

- INV-1: seeded PRNG only.
- INV-3: same seed = same world.
- INV-7: deterministic next-world derivation (seed + collected things).