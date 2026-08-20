# AGENTS.md

## First Read

- Read `.clinerules` — durable project rules, invariants and recurring mistakes.
- Read `ai/knowledge-graph/agent-prime.xml` before planning or editing.
- Use `ai/knowledge-graph/project-graph.xml` only for the task-relevant neighborhood, not as a full-context dump.
- Read `.planning/STATE.md` to know the current project state, then `.planning/BACKLOG.md` for the task queue.
- If behavior changes, update the matching entries in:
  - `ai/knowledge-graph/project-graph.xml`
  - `ai/knowledge-graph/agent-prime.xml`
  - `ai/knowledge-graph/e2e-scenarios.yaml`
  - `.planning/STATE.md` and the task file under `.planning/tasks/`

## Project Shape

- Indie browser game "NEUROGLYPHS": an endless generative kaleidoscope explorer.
- All visuals are glyphs (characters, formulas, symbols) rendered in 3D. No meshes with normal textures, no character models. The world is made of symbols.
- Core loop: fly through a seeded world made of glyphs, collect "things" that fold into your seed, find the single rectangular exit, get re-seeded into the next world. No goal, no death, no fail state.
- Music is the heartbeat: pulsation, colour and motion react to beat, frequency and mood.
- Design source of truth: `.planning/CONCEPT.md` (concept v2, adopted 2026-08-20). Concept v1 (tokens / bounded context window / inference events) is deprecated — treat any surviving v1 wording as stale text to delete, not a requirement.
- Stack: zero-build vanilla JS ESM + Three.js r160 via CDN import map. Canvas-generated glyph textures. DOM overlay HUD. Web Audio. No dependencies, no bundler.
- Entry point: `index.html` -> `src/main.js`.
- Source layout:
  - `src/core/` — seeded RNG (`rng.js`), seed engine (`seed.js`), glyph alphabet (`glyphs.js`), canvas texture atlas (`glyphTexture.js`)
  - `src/world/` — world generation: structures, particles, exit portal (from T03 onward)
  - `test/` — plain node test files (`.mjs`), no test framework
- Planned modules per the backlog: `src/audio/` (music engine), `src/player/` (movement), `src/ui/` (menu, settings). Do not create them before their task.
- Rendering rule: prefer instanced/sprite/points rendering; the field must stay at 60fps with 5k+ glyphs on integrated GPU.

## Commands

- Install deps: none needed — the project has no dependencies.
- Run locally: `npm run dev` (or `npm start`) — static server from `server.js`, open the printed URL. `?seed=abc123` loads a specific world.
- Build: `npm run build` is intentionally a no-op; there is nothing to bundle.
- Test: `npm test` runs the node test files. Expected output: `DETERMINISM_OK`, `SEED_OK` (and `WORLD_OK` once T03 lands).
- Node cannot import `three` (the import map is browser-only), so keep pure math in separate exported functions and test those.

## Session Protocol (multi-agent)

- One task = one session = one task file in `.planning/tasks/`.
- Start of session: read STATE.md -> pick the task marked `next` -> work only on it.
- End of session:
  1. Mark the task file status (`done` / `blocked`) and append a short session log entry (what changed, what was verified, what remains).
  2. Update `.planning/BACKLOG.md` status column.
  3. Update `.planning/STATE.md` (current focus, next task).
  4. Update knowledge-graph files if behavior/flows/invariants changed.
  5. Commit with message prefix `T##: <summary>` (e.g. `T03: add world generator with 8 structure layouts`).
- If a recurring mistake or forgotten convention is found, add it to `.clinerules` (Recurring mistakes section) in the same session.

## Working Rules For Agents

- Do not start implementing a backlog task from a vague chat request. First make the task file explicit: goal, scope, acceptance criteria.
- Keep changes narrow: one session should not touch more than the current task plus the bookkeeping files above.
- With a small local model, follow the small-step prompt format in `.planning/prompts-T03.md`: one file per session, an explicit verification command, and an explicit STOP.
- End implementation reports with:
  - changed files
  - impacted flows/invariants/scenarios
  - how it was verified (command or manual steps)
  - remaining gaps
  - tech debt noted in `.planning/TECH_DEBT.md`, if any

## Where To Verify Changes

- Scene/rendering: `npm run dev`, confirm the glyph world renders, camera responds, no console errors.
- Determinism: `npm test` passes; the same `?seed=` reload produces an identical world, a different seed a visibly different one.
- Exit: exactly one rectangular exit exists and is reachable.
- Performance: browser FPS stays >= 55fps at default world size (5k+ glyph sprites).

## High-Risk Behavior

- Glyph texture atlas changes invalidate cached textures; always dispose old textures to avoid GPU memory leaks.
- World generation must be deterministic: same seed -> same geometry. Never introduce `Math.random()`.
- Do not introduce non-glyph visuals (solid meshes, images) without a task that explicitly changes the art direction.
- Do not add npm dependencies or a bundler without a task that explicitly changes the stack.

## Tech Debt

- If a task reveals important deferred cleanup that is out of scope, record it in `.planning/TECH_DEBT.md` instead of leaving it only in the final message.
