# STATE — current project state

> Read this file FIRST in every session. Update it LAST.

## Current Task

**CONCEPT.md written** — full game concept, systems, art direction, and open questions are now
documented. Next: resolve open questions (esp. #1–#4) and proceed with **T01 — Glyph texture
atlas** (or re-scope tasks to match the concept's module layout).

## Last Session Summary

- 2026-08-19: Project initialized. Planning structure created (BACKLOG, task files, knowledge graph).
- 2026-08-20: T00 scaffold completed — playable glyph-field demo (`index.html` + `src/main.js` on
  Three.js r160 via import map, zero-build). `server.js` static server added (`npm run dev`).
  GitHub repo created: https://github.com/Ilyaworks/neuroglyphs
- 2026-08-20: `.planning/CONCEPT.md` created — one-line pitch, core fantasy, pillars, world
  (glyph field / network topology / signal pulses), core loop, all systems (context window,
  inference engine, world mutation, HUD, audio, levels), art direction, controls, tech stack,
  invariants, content plan, and 10 open questions for design decisions.

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

## Known Risks

- Glyph texture memory at high field sizes (mitigate: texture atlas / sprite batching in T11).
- Pointer lock UX on some browsers (mitigate: click-to-lock overlay, Esc to release).
- Audio autoplay policy (mitigate: start audio on first user gesture).