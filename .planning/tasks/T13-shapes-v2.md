# T13 — New shape families: glyph-cluster core + ring, clean geometry, space references

status: todo
Depends on: T03 (shape infrastructure exists)

## Result (2026-08-21)

13 new shapes added to `src/world/shapePatch.js`:

**Ядро из глифов + кольцо (4):**
- `glyphCoreRing` — 5 отдельных глифов в центре, кольцо, провал 2.62x
- `glyphOrbit` — 3 глифа, наклонное кольцо
- `glyphClusterRing` — 4 глифа, двойное кольцо
- `glyphNucleus` — 5 глифов, кольцо с разрывом, провал 1.51x

**Чистая геометрия (5):**
- `stellatedOcta` — звёздчатый октаэдр
- `nestedCubes` — три вложенных вращённых куба
- `geodesicShell` — три слоя точек на сфере Фибоначчи
- `dodecaSolid` — 12 граней, заполненных объёмом
- `hyperCube` — проекция тессеракта (внешний + внутренний куб + связи)

**Космос (4):**
- `binaryStar` — два ядра на орбите, общий диск
- `supernovaRemnant` — расширяющаяся оболочка с рваными краями
- `asteroidBelt` — плотное кольцо с разбросом
- `magnetar` — ядро + полярные столбы + экваториальное кольцо

Rebuild: 230 shapes total, 111 in world (34 core+ring, 77 varied).
Verified: shape-check (0 failures), npm test (DETERMINISM_OK + SEED_OK),
project-status, preview.html updated with new families.

## Goal

Add new shapes to the catalogue addressing three client requests:
1. **Glyph-cluster core + ring** (not a solid sphere, but distinct glyph shapes clustered
   in the center, with a separate ring orbiting around)
2. **Clean 3D geometric figures** (distinct, recognizable polyhedra and forms)
3. **Space/cosmos references** (galaxies, nebulae, black holes, etc. — the existing
   "космос" family has 4 shapes; client wants more variety)

## Scope

- Add new shapes to `src/world/shapeCatalog.js` (the canonical catalogue)
- Each new shape must be a pure function `(i, p, out)` with no imports, no Math.random()
- Use the splitmix32 hash `h(n)` from `shapePatch.js` for any per-point randomness
- Shapes must use at least `radius` and one other parameter from `p`
- No NaN/Infinity for any `i` from 0 to 2000
- After adding shapes, re-run:
  - `node tools/shape-check.mjs` — all shapes must pass (fill >= 0.12, peak <= 0.45)
  - `node tools/pick-dense-shapes.mjs` — rebuild `fieldShapes.js`
  - `node tools/gen-seeds-gallery.mjs` — rebuild `seeds.html`
  - `npm test` — DETERMINISM_OK + SEED_OK
- Update `preview.html` FAMILIES list to include new families

## Shape requirements

### Family: "Ядро из глифов + кольцо" (4-6 shapes)
- Center: a cluster of distinct glyph-like forms (not a uniform sphere) — e.g. a few
  small polyhedra or glyph clusters arranged in a tight group
- Ring: a separate ring of glyphs orbiting at a larger radius, with a clear density
  gap between core and ring (провал >= 1.3)
- Reference: Saturn's rings, accretion disks, stellar coronas
- Core must be >= 0.15 of points, ring >= 0.25 of points

### Family: "Чистая геометрия" (4-6 shapes)
- Distinct, recognizable 3D geometric figures: e.g. stellated polyhedra, geodesic
  structures, nested cubes, hyperbolic tilings
- Must be visually distinct from existing polyhedra (tetraWire, octaFrame, icoLattice, geoDome)
- Should have volume (not just wireframes) — fill >= 0.12

### Family: "Космос" (4-6 new shapes, in addition to existing nebulaPillars, blackHoleDisc,
cometTail, pulsarBeams)
- New space references: e.g. spiral galaxy with distinct arms, planetary nebula,
  binary star system, supernova remnant, asteroid belt, magnetar
- Must be visually distinct from existing cosmos shapes
- Should have volume and density

## Acceptance criteria

- [ ] New shapes added to `shapeCatalog.js`
- [ ] `node tools/shape-check.mjs` passes for all new shapes
- [ ] `node tools/pick-dense-shapes.mjs` re-runs successfully
- [ ] `node tools/gen-seeds-gallery.mjs` re-runs successfully
- [ ] `npm test` passes (DETERMINISM_OK + SEED_OK)
- [ ] `preview.html` shows new shapes in correct families
- [ ] `seeds.html` updated with new shape seeds
- [ ] No Math.random() in any new shape
- [ ] No NaN/Infinity for i in [0, 2000)

## Verification

```
node tools/shape-check.mjs
node tools/pick-dense-shapes.mjs
node tools/gen-seeds-gallery.mjs
npm test
node tools/project-status.mjs
```

Open http://localhost:5173/src/world/preview.html — new shapes visible and navigable.
Open http://localhost:5173/seeds.html — new shapes have seeds.

## Notes

- Shape contract: `(i, p, out)` where `out[0..2]` are x, y, z
- Parameters `p`: radius, flatten, distPow, tubeR, arms, twist, spread, thickness,
  strands, turns, clusterCount, clusterRadius, freq, amp, knotP, knotQ
- Hash for randomness: `h(n)` from `shapePatch.js` (splitmix32)
- Do NOT modify `main.js`, `legacyShapes.js`, or existing shapes
- Commit message: `T13: add glyph-core+ring, clean geometry, and space reference shapes`
