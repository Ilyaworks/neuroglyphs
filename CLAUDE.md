# CLAUDE.md

Cross-session memory for agents working on NEUROGLYPHS. Update this file whenever a session discovers a convention, a recurring mistake, or useful extracted context from past session logs.

## Project In One Paragraph

NEUROGLYPHS is an indie 3D game where the entire world is made of glyphs (characters/tokens). The player flies through a neural network made of symbol fields, collects tokens into a bounded context window, and triggers inference events by assembling the right token sequences. Stack: Vite + vanilla JS ESM + Three.js, canvas-generated glyph textures, DOM HUD.

## Conventions

- Task IDs are `T##` (zero-padded, e.g. `T03`). Every commit message starts with the task ID: `T03: <summary>`.
- One session = one task file under `.planning/tasks/T##-slug.md`.
- Bookkeeping files that must be updated at the end of every session: the task file, `.planning/BACKLOG.md`, `.planning/STATE.md`, and knowledge-graph files if behavior changed.
- Determinism: the glyph field layout is seeded (`src/data/seed.js` or equivalent). Never use `Math.random()` for world generation without routing it through the seeded RNG.
- Glyph rendering: glyphs are drawn to canvas -> texture -> sprite/instanced plane. Keep the atlas cache in one module; dispose textures on rebuild.
- No non-glyph visuals unless a task explicitly changes art direction.
- Language: project docs and in-game text may be in English or Russian; commit messages and task files in English for consistency.

## Recurring Mistakes (add here when agents keep tripping over the same thing)

- (none recorded yet — first session)

## Extracted From Past Session Logs

- (none yet — to be filled by a dedicated log-analysis session)

## Environment Notes

- Dev machine: Windows 11, cmd shell, git available, `gh` CLI not installed.
- GitHub push: no `gh` auth configured. Use a personal access token in the remote URL or ask the user for one. Do not store tokens in committed files.