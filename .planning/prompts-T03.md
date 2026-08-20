# Ready-to-paste prompts for T03 (small steps, weak local model)

Rules: one prompt = one Cline task (New Task each time). Run them in order.
Do not merge two prompts into one session.

---

## P0 — close the dangling working tree (do this FIRST)

Project: C:\Users\onlin\Desktop\neuroglyphs

There is uncommitted work in `src/main.js` (+394/-193 lines) left by a previous
session. It declares `function buildGlyphField` TWICE: at line ~99 and line ~308.
The second declaration silently shadows the first, so the first one is dead code.

Do exactly this:
1. Read only `src/main.js`. Do not read other files.
2. Identify which of the two `buildGlyphField` definitions is actually used by
   `init()` / the render setup (check the call sites and their argument shape).
3. Delete the unused one. Change nothing else. Do not rename, do not reformat.
4. Run: `npm test` — it must print DETERMINISM_OK and SEED_OK.
5. Commit exactly this file: `git add src/main.js && git commit -m "T02: drop dead duplicate buildGlyphField in main.js"`

Constraints: do NOT start T03. Do NOT touch STATE.md/BACKLOG.md. One tool call
per message. STOP after the commit and report what you deleted and why.

---

## P1 — src/world/structures.js (new file, no integration)

Project: C:\Users\onlin\Desktop\neuroglyphs
Task: T03 step 1 of 4. Read `.planning/tasks/T03-world-gen.md` ONLY for the
structure table. Do not read the whole repo.

Create ONE new file: `src/world/structures.js`.

Split pure math from Three.js so the tests can run in Node without a bundler:

- Export 8 PURE layout functions, no Three.js import, no DOM:
  `layoutFractalCorridors`, `layoutNonEuclidean`, `layoutCrystalline`,
  `layoutOrganic`, `layoutGeometric`, `layoutAlmostReal`, `layoutVoid`,
  `layoutCrossedWorlds`.
  Signature: `(rng, params) -> { positions: Float32Array, scales: Float32Array, count: number }`
  where `positions` is xyz-triples. `rng` is the function returned by `decodeSeed`.
- Implement THREE of them for real: `layoutFractalCorridors`, `layoutCrystalline`,
  `layoutVoid`. The other five: simple deterministic variations (a stub is fine).
- Also export `LAYOUTS` — an array of the 8 functions in the table's ID order
  (0 = fractal corridors ... 7 = crossed worlds).

Hard constraints:
- No `Math.random()` anywhere — only the passed `rng`.
- Do NOT import three, do NOT import from `src/core/`, do NOT touch any other file.
- Same rng seed must give byte-identical Float32Array output.

Verify: `node -e "import('./src/world/structures.js').then(m=>console.log(Object.keys(m).length))"`
must print 9. STOP after that and report the exported names.

---

## P2 — src/world/generator.js (new file, no integration)

Project: C:\Users\onlin\Desktop\neuroglyphs
Task: T03 step 2 of 4. Read ONLY `src/world/structures.js`, `src/core/seed.js`
and `src/core/glyphTexture.js` before writing. Nothing else.

Create ONE new file: `src/world/generator.js`. Exports exactly three functions:

```js
export function generateWorld(decodedSeed, scene) // -> WorldGroup (THREE.Group)
export function disposeWorld(worldGroup)          // -> void
export function getExitPosition(worldGroup)       // -> THREE.Vector3
```

`generateWorld` must:
- pick the layout via `LAYOUTS[decodedSeed.structure]` from `./structures.js`;
- build ONE `THREE.Points` object from the returned Float32Arrays, using the
  atlas from `buildGlyphAtlas()` (import from `../core/glyphTexture.js`);
- add a particle field whose count comes from `decodedSeed.density`;
- set `scene.fog` from `decodedSeed.palette`;
- add exactly ONE rectangular exit portal (4 glyph bars) and store its position
  on the group as `group.userData.exitPosition`;
- return the group, and add nothing to `scene` except that group.

`disposeWorld` must dispose geometries and materials it created.

Hard constraints: no `Math.random()`; do NOT modify `src/main.js` or any other
existing file; imports allowed only from `three`, `./structures.js`,
`../core/glyphTexture.js`, `../core/glyphs.js`.

Verify: `node --check src/world/generator.js`. STOP and report the file's exports.

---

## P3 — test/world.test.mjs

Project: C:\Users\onlin\Desktop\neuroglyphs
Task: T03 step 3 of 4. Read ONLY `src/world/structures.js`, `test/seed.test.mjs`
(for the existing test style) and `package.json`.

Create `test/world.test.mjs` in the same plain-node style as the existing tests
(no test framework, process.exit(1) on failure, prints `WORLD_OK` at the end).

It must import ONLY `src/world/structures.js` and `src/core/seed.js` — never
`three`, because Node has no import map. Assertions:
1. Same seed -> identical `positions` (compare every element) for all 8 layouts.
2. Different seeds -> different `positions` for the three real layouts.
3. All 8 layouts return `count > 0` and `positions.length === count * 3`.
4. No layout output contains NaN.

Then add it to the `test` script in `package.json`, appended after the existing
two, and run `npm test`. All three must pass: DETERMINISM_OK, SEED_OK, WORLD_OK.

Do not modify anything under `src/`. If a test fails because a layout is wrong,
report the failure and STOP — do not "fix" it by weakening the test.

---

## P4 — integrate into main.js + bookkeeping

Project: C:\Users\onlin\Desktop\neuroglyphs
Task: T03 step 4 of 4. Read ONLY `src/main.js` and `src/world/generator.js`.

1. In `src/main.js`, replace the existing static glyph-field construction with
   `generateWorld(seed, scene)` from `./world/generator.js`. Keep the camera,
   controls, resize handler and animation loop as they are.
   While you are there, delete the concept-v1 leftovers: the `buildContextRing`
   function and its call site, and any wording about tokens / context window /
   inference in the file's header comment. Nothing else.
2. Run `npm test` — DETERMINISM_OK, SEED_OK, WORLD_OK must all print.
3. Run `npm run dev`, open http://localhost:8080/?seed=abc123 and confirm in the
   browser console that there are no errors. Report what you saw.
4. Bookkeeping, in this order: mark T03 done in `.planning/tasks/T03-world-gen.md`
   and `.planning/BACKLOG.md`; append a session-log row and update "Current Task"
   in `.planning/STATE.md` (next: T04).
5. Commit: `git add -A && git commit -m "T03: add world generator with 8 structure layouts, exit portal and determinism tests"`

STOP after the commit. Do not start T04.

---

## Note: docs are already fixed (2026-08-20)

The old concept-v1 wording that used to send agents off course is gone.
`CLAUDE.md` was deleted (the working agent is Qwen via Cline, which reads
`.clinerules`), and `AGENTS.md`, `README.md`, `agent-prime.xml` and
`e2e-scenarios.yaml` now describe concept v2 only. Durable rules, invariants and
recurring mistakes live in `.clinerules`. If you still find v1 wording anywhere,
delete it rather than implementing it.

The last v1 leftover is in code, not docs: `buildContextRing` in `src/main.js`
(a HUD ring of "context tokens") and the v1 wording in that file's header
comment. P4 removes both as part of the world-generator integration.
