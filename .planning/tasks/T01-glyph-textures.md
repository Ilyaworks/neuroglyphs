# T01 - Seeded RNG + glyph alphabet + canvas textures

**Status:** todo
**Depends on:** T00
**Goal:** A deterministic glyph alphabet rendered to canvas textures, ready for instancing.

## Steps

1. src/core/rng.js - mulberry32 seeded PRNG, reproducible per seed.
2. src/core/glyphs.js - define the glyph alphabet (unicode codepoints + custom shapes).
3. src/core/glyphTexture.js - render each glyph to a canvas, produce a THREE.CanvasTexture.
4. Cache a GlyphSet with lookup by index.

## Acceptance Criteria

- [ ] Same seed produces the same glyph field.
- [ ] Textures are crisp at typical sizes.
- [ ] GlyphSet is cached, not rebuilt per frame.

## Files Touched

- src/core/rng.js, src/core/glyphs.js, src/core/glyphTexture.js
