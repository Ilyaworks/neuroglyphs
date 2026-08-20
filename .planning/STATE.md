# STATE — current project state

> Read this file FIRST in every session. Update it LAST.

## Current Task

**Concept v2 adopted (2026-08-20).** Old token/inference concept deprecated.
T00 + T01 + T02 done (scaffold + seeded RNG/glyph textures + seed engine).
Next: **T03 — World generator v1 (structures + particles)**.

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
3. Keep invariants from `CLAUDE.md` and `ai/knowledge-graph/agent-prime.xml`.
4. When done: mark task `done` in the task file and `BACKLOG.md`, append a session
   summary below, update `ai/knowledge-graph/` if behavior changed, commit with `T##:` prefix.

## Session Log

| Date       | Task | Summary                                                        |
|------------|------|----------------------------------------------------------------|
| 2026-08-19 | —    | Repo scaffolded: planning docs, knowledge graph, backlog T00–T12 |
| 2026-08-20 | T00  | Scaffold done: glyph-field demo (index.html + src/main.js, Three.js r160 import map), server.js static server (npm run dev), GitHub repo Ilyaworks/neuroglyphs |
| 2026-08-20 | T01  | Seeded RNG (mulberry32), glyph alphabet + palette, canvas texture atlas; main.js refactored to import modules; determinism test added (npm test -> DETERMINISM_OK) |
| 2026-08-20 | T02  | Seed engine: 8 world fields bit-packed into base36 seed (≤16 chars); encode/decode/random/validate; deterministic rng per seed; seed.test.mjs (round-trip 200x); main.js reads ?seed= URL param |

## Known Risks

- Glyph texture memory at high field sizes (mitigate: texture atlas / sprite batching in T11).
- Pointer lock UX on some browsers (mitigate: click-to-lock overlay, Esc to release).
- Audio autoplay policy (mitigate: start audio on first user gesture).