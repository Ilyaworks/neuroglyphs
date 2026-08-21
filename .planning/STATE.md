# STATE — current project state

> Read this file FIRST in every session. Update it LAST.

## Current Task

**Full rebuild (2026-08-21).** All code deleted. Starting from scratch.
Next: **T00 — Project scaffold: Three.js boot loop**.
Task file: `.planning/tasks/T00-scaffold.md`.

## Last Session Summary

- 2026-08-21: **Full code reset.** All source code (src/, test/, tools/, server.js,
  index.html, package.json, seeds.html) deleted. Planning docs, rules, and
  knowledge graph preserved. All tasks reset to todo. Starting fresh from T00.

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
| 2026-08-21 | —    | Full code reset: all source deleted, all tasks reset to todo. Starting fresh from T00. |

## Known Risks

- Glyph texture memory at high field sizes (mitigate: texture atlas / sprite batching in T11).
- Pointer lock UX on some browsers (mitigate: click-to-lock overlay, Esc to release).
- Audio autoplay policy (mitigate: start audio on first user gesture).
