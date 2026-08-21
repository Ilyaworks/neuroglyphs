# STATE — current project state

> Read this file FIRST in every session. Update it LAST.

## Current Task

**Concept v2 adopted (2026-08-20).** Old token/inference concept deprecated.
T00 + T01 + T02 + T03 done (scaffold + seeded RNG/glyph textures + seed engine + world generator).
T13 done: 13 new shapes (glyph-core+ring, geometry, space).
T14 done: 64 new shapes from user's Russian descriptions (4 families).
Next: **T04 — Music Engine** (Web Audio, FFT, reactivity hooks) or **T06 — Movement** (fly-cam).
Task files: `.planning/tasks/T04-music-engine.md`, `.planning/tasks/T06-movement.md`.

## Last Session Summary

- 2026-08-19: Project initialized. Planning structure created (BACKLOG, task files, knowledge graph).
- 2026-08-20: T00 scaffold completed — playable glyph-field demo (`index.html` + `src/main.js` on
  Three.js r160 via import map, zero-build). `server.js` static server added (`npm run dev`).
  GitHub repo created: https://github.com/Ilyaworks/neuroglyphs
- 2026-08-20: T01 done — seeded RNG (mulberry32), glyph alphabet + palette, canvas texture atlas;
  determinism test added (`npm test` -> DETERMINISM_OK).
- 2026-08-20: **Concept v2 rewrite.** `.planning/CONCEPT.md` fully replaced: generative
  kaleidoscope explorer (no goal, no death, music-driven, seed=world). BACKLOG rewritten
  (T02–T12 v2). Old token/inference concept deprecated. New task files T02–T12 created.
  Knowledge graph updated. CLAUDE.md updated with v2 note.
- 2026-08-20: **T02 done — seed engine.** `src/core/seed.js`: encode/decode of 8 world
  fields (structure, mood, palette, density, fractal, motion, music, nonEuclidean) packed
  into 66 bits → base36 seed ≤16 chars. `decodeSeed` returns flat params + deterministic
  mulberry32 rng. `randomSeed(rng?)`, `validateSeed`, `GROUP_MAX`. `test/seed.test.mjs`
  (determinism, round-trip 200x, validation) → `npm test` = DETERMINISM_OK + SEED_OK.
  `main.js` now reads `?seed=` URL param and uses decoded rng.

## How to Pick Up Work

1. Read this file to find the current task.
2. Open the task file in `.planning/tasks/` and follow its steps.
3. Keep invariants from `.clinerules` and `ai/knowledge-graph/agent-prime.xml`.
4. When done: mark task `done` in the task file and `BACKLOG.md`, append a session
   summary below, update `ai/knowledge-graph/` if behavior changed, commit with `T##:` prefix.

## Session Log

| Date       | Task | Summary                                                        |
|------------|------|----------------------------------------------------------------|
| 2026-08-19 | —    | Repo scaffolded: planning docs, knowledge graph, backlog T00–T12 |
| 2026-08-20 | T00  | Scaffold done: glyph-field demo (index.html + src/main.js, Three.js r160 import map), server.js static server (npm run dev), GitHub repo Ilyaworks/neuroglyphs |
| 2026-08-20 | T01  | Seeded RNG (mulberry32), glyph alphabet + palette, canvas texture atlas; main.js refactored to import modules; determinism test added (npm test -> DETERMINISM_OK) |
| 2026-08-20 | T02  | Seed engine: 8 world fields bit-packed into base36 seed (≤16 chars); encode/decode/random/validate; deterministic rng per seed; seed.test.mjs (round-trip 200x); main.js reads ?seed= URL param |
| 2026-08-21 | T03  | World generator v1: structures.js (8 layouts + worldParams), generator.js (compose structure+particles+fog+exit), world.test.mjs (determinism, all 8 types, exit validity); main.js integrated with generateWorld; npm test = DETERMINISM_OK + SEED_OK + WORLD_OK |

- 2026-08-20: **Docs purged of concept v1.** `CLAUDE.md` deleted (the working agent is Qwen
  via Cline, which reads `.clinerules` instead); its durable rules, invariants and recurring
  mistakes moved into `.clinerules`. `AGENTS.md`, `README.md`,
  `ai/knowledge-graph/agent-prime.xml` and `e2e-scenarios.yaml` rewritten for v2 — the old
  token/context-window/inference wording is gone, as are references to the never-existing
  `src/systems/`, `src/ui/`, `src/data/` and to Vite. `project-graph.xml` statuses corrected
   (m-seed and T02 are done, T03 is next). The last v1 leftover (`buildContextRing` in
   `src/main.js`) was renamed to `buildOrbitRing` on 2026-08-21.

- 2026-08-21: **Концепция v1 удалена из кода, каталог форм подключён к сцене.**
  `main.js` сжался с 2072 до 472 строк: инлайновый список из 169 форм (88 из них — вариации
  тора) заменён импортом из `src/world/shapeCatalog.js`. В мир попадают только достаточно
  плотные формы — список в `src/world/fieldShapes.js` (33 из 44, порог заполненности 0.15,
  пересборка `node tools/pick-dense-shapes.mjs`). Убрана механика токенов: счётчики TOKENS и
  CONTEXT в HUD, полоса заполнения, накопление в цикле; пробел остался как визуальный пульс.
  В HUD теперь показываются сид и имя формы. Ядро и вращающееся кольцо сохранены намеренно —
  это художественный элемент, который нравится заказчику.
  Инструменты: `tools/shape-check.mjs` (проверка формы на объём и оболочку),
   `tools/pick-dense-shapes.mjs`, `tools/gen-seeds-gallery.mjs`, `tools/project-status.mjs`
   (сводка состояния — запускать в начале каждой сессии).

- 2026-08-21: **Настоящие «светило + кольцо», пустая середина, починенный тест детерминизма.**
  1. Вырожденный хеш `h(n)` в `shapePatch.js` заменён на splitmix32 (корреляция -0.42 → 0.001,
     заполненность чистого хеша 0.085 → 0.77) — геометрия всех форм на `h(i)` изменилась.
  2. Шесть форм-«светил с провалом» (провал >= 1.3, ядро >= 0.15, кольцо >= 0.25, объём >= 0.15):
     `ringedStar` (1.90), `accretionHalo` (5.41), `stellarCorona` (4.30), `ringNebula` (1.43),
     `globularBloom` (1.46), `spiralBulge` (1.97) — по референсам заказчика: кольца Сатурна
     со щелью Кассини, аккреционный диск, звезда с короной, кольцевая туманность, шаровое
     скопление с гало, спиральная галактика с балджем. Плюс `mushroom` (2.26) — всего 7
     с настоящим провалом, все в группе CORE_RING.
  3. Пять форм с честно пустой серединой (центр < 0.05, объём >= 0.20): `nebulaShell`,
     `cavernHalls`, `tunnelRings`, `haloCage` — оболочки, каверны, тоннель, гало-клетка;
     все прошли отбор и попали в VARIED.
  4. `test/determinism.test.mjs` переписан: теперь проверяет реальную цепочку
     `decodeSeed` -> выбор формы из `fieldShapes.js` (первый бросок rng) -> вызов формы из
     `allShapes.js` (старые формы через `setRng`). Два прогона одного сида побайтово
     одинаковы, разные сида — разные. `npm test` = DETERMINISM_OK + SEED_OK.
  5. Косметика v1: `buildContextRing` -> `buildOrbitRing` (функция, вызов, комментарий),
     мёртвые CSS-правила `#context-bar`/`#context-fill` удалены из `index.html`.
   Пересборка: 217 форм в наборе (169 старых + 51 новых), 99 в мире (29 ядро+кольцо, 70 разные),
   `seeds.html` пересобран (99 ссылок). Проверено: `node tools/shape-check.mjs` (0 отказов),
   `npm test`, `node tools/project-status.mjs`, галерея на http://localhost:5173/seeds.html.

- 2026-08-21: **T13 — задача на новые формы.** Заказчик просит: (1) ядро из отдельных
   глифов + кольцо вокруг (не сплошной шар), (2) чистые 3D геометрические фигуры,
   (3) больше космических референсов. Задача создана: `.planning/tasks/T13-shapes-v2.md`.
   Также `preview.html` починен: теперь импортирует `allShapes.js` (217 форм) вместо
   `shapeCatalog.js` (40) — один каталог для preview и игры.

- 2026-08-21: **T13 — 13 новых форм добавлены.** Три семейства:
   1. **Ядро из глифов + кольцо** (4): `glyphCoreRing` (провал 2.62x), `glyphOrbit`,
      `glyphClusterRing`, `glyphNucleus` (провал 1.51x) — в центре 3–5 отдельных
      малых форм, вокруг кольцо с явным провалом.
   2. **Чистая геометрия** (5): `stellatedOcta`, `nestedCubes`, `geodesicShell`,
      `dodecaSolid`, `hyperCube` — заполненные объёмом, не каркасы.
   3. **Космос** (4): `binaryStar`, `supernovaRemnant`, `asteroidBelt`, `magnetar` —
      двойная звезда, остаток сверхновой, пояс астероидов, магнетар с полярными столбами.
   Пересборка: 230 форм в наборе (169 старых + 64 новых), 111 в мире (34 ядро+кольцо,
   77 разные). `seeds.html` пересобран (111 ссылок). Проверено: `node tools/shape-check.mjs`
   (0 отказов), `npm test` (DETERMINISM_OK + SEED_OK), `node tools/project-status.mjs`.
    `preview.html` обновлён: новые семейства в FAMILIES.

- 2026-08-21: **T14 — 64 новые формы по описаниям заказчика.** Четыре семейства:
    1. **Светило + кольцо + пустота** (8): `accretionDisk`, `stellarCorona2`, `coreInRing`,
       `galacticBulge`, `ringedLuminar`, `nucleusHalo`, `globularCluster`, `ringNebula2`.
    2. **Пустая середина** (12): `archBridge2`, `dodecahedron2`, `mandelbrotHull`,
       `tunnelRings2`, `circularColonnade`, `torus2`, `nebulaShell2`, `cavernHalls2`,
       `haloCage2`, `geodesicShell2`, `supernovaRemnant2`, `asteroidBelt2`.
    3. **Ядро и кольцо, без пустоты** (18): `canyonWalls`, `waterRipples`, `dunes`,
       `orbits`, `doubleHelix`, `nebulaPillars`, `braidedStrand`, `waveMembrane`,
       `mountainRidge`, `wallFolds2`, `ziggurat2`, `clusterRing`, `pulsarBeams`,
       `roesslerRibbon`, `cometTail`, `logSpiral2`, `stellatedOcta2`, `nestedCubes2`.
    4. **Прочие** (26): `centerSphere`, `geodesicDome`, `binaryStar2`, `hyperbolicSaddle`,
       `voronoiCells`, `blackHoleDisk`, `centerSpiral`, `vortexEye`, `vortex2`,
       `domeShell2`, `hyperCube2`, `juliaCloud`, `centerBloom`, `hexGrid`,
       `octahedronFrame`, `magnetar2`, `icosahedronLattice`, `lozengeAttractor`,
       `tetrahedronFrame`, `kleinBottle`, `galacticArms`, `cubeLattice2`,
       `centerLattice`, `layeredPlates`, `crystalSpires`, `mobiusStrip`.
    `preview.html` обновлён: FAMILIES показывает только 64 новые формы.
    Проверено: `node tools/shape-check.mjs` (0 отказов), `npm test` (DETERMINISM_OK + SEED_OK).

## Known Risks

- Glyph texture memory at high field sizes (mitigate: texture atlas / sprite batching in T11).
- Pointer lock UX on some browsers (mitigate: click-to-lock overlay, Esc to release).
- Audio autoplay policy (mitigate: start audio on first user gesture).