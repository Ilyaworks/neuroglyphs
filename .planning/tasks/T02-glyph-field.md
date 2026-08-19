# T02 - 3D glyph field (instanced, 5k+ glyphs)

**Status:** todo
**Depends on:** T01
**Goal:** A dense field of 5k+ glyphs rendered as a single instanced draw call.

## Steps

1. src/world/glyphField.js - InstancedMesh of glyph quads/plane sprites.
2. Distribute glyphs in a volume using the seeded RNG.
3. Per-instance glyph index + color variation.
4. Gentle idle drift animation (shader or CPU update).

## Acceptance Criteria

- [ ] 5k+ glyphs render in a single draw call.
- [ ] No per-glyph object allocation per frame.
- [ ] Field is deterministic for a given seed.
