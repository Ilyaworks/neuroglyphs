# T01 - Seeded RNG + glyph alphabet + canvas textures

**Status:** todo
**Depends on:** T00
**Goal:** A deterministic glyph alphabet rendered to canvas textures, ready for instancing.

## Steps

1. src/core/rng.js - mulberry32 seeded PRNG, reproducible per seed.
2. src/core/glyphs.js - define the glyph alphabet (unicode codepoints + custom shapes).
3. src/core/glyphTexture.js - render each glyph to a canvas, produce a THREE.CanvasTexture.
4. Cache a GlyphSet with lookup by index.
5. Refactor src/main.js to import from the new modules (no duplicated inline code).
6. Add test/determinism.test.mjs + `npm test` script.

## Acceptance Criteria

- [x] Same seed produces the same glyph field. (verified by test/determinism.test.mjs -> DETERMINISM_OK)
- [x] Textures are crisp at typical sizes. (atlas: 96px cells, 64px font, mipmapped, anisotropy 4)
- [x] GlyphSet is cached, not rebuilt per frame. (atlas built once at boot; main.js imports GLYPHS/PALETTE)

## Files Touched

- src/core/rng.js, src/core/glyphs.js, src/core/glyphTexture.js, src/main.js, test/determinism.test.mjs, package.json

## Notes

- `src/core/glyphs.js` exports `GLYPHS` (deduped array) and `PALETTE` (hex list).
- `src/core/glyphTexture.js` exports `buildGlyphAtlas()` -> { texture, cols, rows, cell, indexFor }.
- `src/core/rng.js` exports `mulberry32(seed)`.
- main.js now the single consumer of the atlas; field/core/ring all share one texture.
