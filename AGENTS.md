# AGENTS.md

## First Read

- Read `ai/knowledge-graph/agent-prime.xml` before planning or editing.
- Use `ai/knowledge-graph/project-graph.xml` only for the task-relevant neighborhood, not as a full-context dump.
- Read `.planning/STATE.md` to know the current project state, then `.planning/BACKLOG.md` for the task queue.
- If behavior changes, update the matching entries in:
  - `ai/knowledge-graph/project-graph.xml`
  - `ai/knowledge-graph/agent-prime.xml`
  - `ai/knowledge-graph/e2e-scenarios.yaml`
  - `.planning/STATE.md` and the task file under `.planning/tasks/`

## Project Shape

- Indie game "NEUROGLYPHS": 3D exploration/puzzle inside a living neural network.
- All visuals are glyphs (characters/tokens) rendered in 3D. No meshes with normal textures, no character models. The world is made of symbols.
- Core mechanic: the player flies through a glyph field, collects tokens into a limited context window; certain token sequences trigger "inference" events that mutate the world and open gates.
- Stack: Vite + vanilla JS (ESM) + Three.js. Canvas-generated glyph textures. DOM overlay HUD. WebAudio.
- Entry point: `index.html` -> `src/main.js`.
- Source layout:
  - `src/core/` — engine boot, game loop, input, camera
  - `src/world/` — glyph field, network layers, synapses, signal pulses
  - `src/systems/` — context window, inference, audio
  - `src/ui/` — DOM HUD
  - `src/data/` — glyph alphabet, level definitions
- Rendering rule: prefer instanced/sprite rendering; the field must stay at 60fps with 5k+ glyphs on integrated GPU.

## Commands

- Install deps: `npm install`
- Run locally: `npm run dev` (Vite dev server, open the printed URL)
- Build: `npm run build` (output in `dist/`)
- Preview build: `npm run preview`
- No test runner yet; verification is manual (see "Where To Verify Changes").

## Session Protocol (multi-agent)

- One task = one session = one task file in `.planning/tasks/`.
- Start of session: read STATE.md -> pick the task marked `next` -> work only on it.
- End of session:
  1. Mark the task file status (`done` / `blocked`) and append a short session log entry (what changed, what was verified, what remains).
  2. Update `.planning/BACKLOG.md` status column.
  3. Update `.planning/STATE.md` (current focus, next task).
  4. Update knowledge-graph files if behavior/flows/invariants changed.
  5. Commit with message prefix `T##: <summary>` (e.g. `T03: add synapse pulse propagation`).
- If a recurring mistake or forgotten convention is found, add it to `CLAUDE.md` (Recurring Mistakes section) in the same session.

## Working Rules For Agents

- Do not start implementing a backlog task from a vague chat request. First make the task file explicit: goal, scope, acceptance criteria.
- Keep changes narrow: one session should not touch more than the current task plus the bookkeeping files above.
- End implementation reports with:
  - changed files
  - impacted flows/invariants/scenarios
  - how it was verified (command or manual steps)
  - remaining gaps
  - tech debt noted in `.planning/TECH_DEBT.md`, if any

## Where To Verify Changes

- Scene/rendering: `npm run dev`, check glyph field renders, camera orbits, no console errors.
- Context/inference: HUD shows collected tokens; triggering a sequence produces a visible world mutation.
- Performance: browser FPS (or `performance` readout in HUD) stays >= 55fps at default field size.

## High-Risk Behavior

- Glyph texture atlas changes invalidate cached textures; always dispose old textures to avoid GPU memory leaks.
- Context window is bounded; token collection must be deterministic (same field seed -> same layout).
- Do not introduce non-glyph visuals (solid meshes, images) without a task that explicitly changes the art direction.

## Tech Debt

- If a task reveals important deferred cleanup that is out of scope, record it in `.planning/TECH_DEBT.md` instead of leaving it only in the final message.