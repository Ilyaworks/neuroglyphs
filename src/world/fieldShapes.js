// Формы глифового поля: только достаточно плотные.
//
// Список отобран по метрике заполненности объёма из tools/shape-check.mjs:
// доля занятых ячеек в сетке 16x16x16 должна быть не ниже 0.15. Разряженные формы
// («тонкая струнка глифов в пустоте») в мир не попадают, хотя и остаются в каталоге.
//
// Пересобрать список: node tools/pick-dense-shapes.mjs [порог]
export const FIELD_SHAPE_KEYS = [
  'sandDunes',             // 0.694
  'waveMembrane',          // 0.683
  'logSpiral',             // 0.614
  'centerSpiral',          // 0.579
  'mountainRidge',         // 0.561
  'canyonWalls',           // 0.557
  'archBridge',            // 0.512
  'pulsarBeams',           // 0.416
  'centerBraid',           // 0.358
  'centerTorus',           // 0.329
  'doubleHelix',           // 0.290
  'domeShell',             // 0.283
  'juliaCloud',            // 0.274
  'lozengeAttractor',      // 0.273
  'mandelShell',           // 0.271
  'cubeLattice',           // 0.253
  'kleinBottle',           // 0.252
  'nebulaPillars',         // 0.217
  'colonnadeRing',         // 0.199
  'galacticArms',          // 0.194
  'cometTail',             // 0.193
  'hexGrid',               // 0.183
  'centerVortex',          // 0.182
  'centerRipple',          // 0.179
  'icoLattice',            // 0.178
  'roesslerRibbon',        // 0.177
  'ziggurat',              // 0.175
  'globularBloom',         // 0.155
  'accretionHalo',         // 0.152
  'layeredPlates',         // 0.152
  'stellarCorona',         // 0.151
  'mobiusStrip',           // 0.151
  'ringedStar',            // 0.151
];
