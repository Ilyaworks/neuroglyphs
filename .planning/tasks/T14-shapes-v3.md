# T14 — 64 New Shapes from User Descriptions

**Status:** todo
**Depends on:** T13
**Files modified:**
- `src/world/shapePatch.js` (64 new shape functions added to PATCH)
- `src/world/preview.html` (FAMILIES updated to show only the 64 new shapes)

## Goal

Create 64 NEW shapes in `shapePatch.js` based on the user's specific list of
4 categories (8 + 12 + 18 + 26), then display them in `preview.html` so the
user can select which ones to keep.

## Families

### 1. Светило + кольцо + пустота (8)
`accretionDisk`, `stellarCorona2`, `coreInRing`, `galacticBulge`,
`ringedLuminar`, `nucleusHalo`, `globularCluster`, `ringNebula2`

### 2. Пустая середина (12)
`archBridge2`, `dodecahedron2`, `mandelbrotHull`, `tunnelRings2`,
`circularColonnade`, `torus2`, `nebulaShell2`, `cavernHalls2`,
`haloCage2`, `geodesicShell2`, `supernovaRemnant2`, `asteroidBelt2`

### 3. Ядро и кольцо, без пустоты (18)
`canyonWalls`, `waterRipples`, `dunes`, `orbits`, `doubleHelix`,
`nebulaPillars`, `braidedStrand`, `waveMembrane`, `mountainRidge`,
`wallFolds2`, `ziggurat2`, `clusterRing`, `pulsarBeams`,
`roesslerRibbon`, `cometTail`, `logSpiral2`, `stellatedOcta2`, `nestedCubes2`

### 4. Прочие (26)
`centerSphere`, `geodesicDome`, `binaryStar2`, `hyperbolicSaddle`,
`voronoiCells`, `blackHoleDisk`, `centerSpiral`, `vortexEye`, `vortex2`,
`domeShell2`, `hyperCube2`, `juliaCloud`, `centerBloom`, `hexGrid`,
`octahedronFrame`, `magnetar2`, `icosahedronLattice`, `lozengeAttractor`,
`tetrahedronFrame`, `kleinBottle`, `galacticArms`, `cubeLattice2`,
`centerLattice`, `layeredPlates`, `crystalSpires`, `mobiusStrip`

## Verification

- `node tools/shape-check.mjs` — 0 failures
- `npm test` — DETERMINISM_OK + SEED_OK
- `preview.html` shows all 64 shapes in 4 families with pick/export buttons

## Session Log

- 2026-08-21: All 64 shapes written in 4 batches (8+12+18+26). Fixed
  `icosahedronLattice` edge-indexing bug (was using `Math.floor(e/2)` instead
  of proper edge list). `preview.html` FAMILIES updated to reference new keys.
  Verification passed.
