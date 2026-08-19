# STATE — current project state

> Read this file FIRST in every session. Update it LAST.

## Current Task

**T00 — Project scaffold: Vite + Three.js boot loop** (in-progress)

## Last Session Summary

- 2026-08-19: Project initialized. Planning structure created (BACKLOG, task files, knowledge graph).
- Scaffold code for T00 is being written in this session.

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

## Known Risks

- Glyph texture memory at high field sizes (mitigate: texture atlas / sprite batching in T11).
- Pointer lock UX on some browsers (mitigate: click-to-lock overlay, Esc to release).
- Audio autoplay policy (mitigate: start audio on first user gesture).