# CLAUDE.md

Cross-session memory for agents working on NEUROGLYPHS. Update this file whenever a session discovers a convention, a recurring mistake, or useful extracted context from past session logs.

## Project In One Paragraph

NEUROGLYPHS is an indie 3D game where the entire world is made of glyphs (characters/tokens). The player flies through a neural network made of symbol fields, collects tokens into a bounded context window, and triggers inference events by assembling the right token sequences. Worlds are seeded (deterministic), each has a mood (serene, eerie, claustrophobic, joyful, void, uncanny), and is driven by music reactivity. The player can transition between worlds via "exits", type neuro-prompts to tweak the world in real-time, and share worlds via seed codes. Stack: Vite + vanilla JS ESM + Three.js, canvas-generated glyph textures, DOM HUD.

## Core Theme: Tokens, Context & Inference

This is the conceptual heart of the game. Every visual element is a **token** (a glyph/character). The player accumulates tokens into a **bounded context window** (like an LLM's context). When the right sequence of tokens is assembled, an **inference event** fires — a world-level transformation or transition.

Key implications for implementation:

- **Tokens are the atoms.** Every glyph in the world is a token. There is no "non-token" visual. The player's context window is a collection of tokens they have collected/encountered.
- **Context window is bounded.** There is a maximum number of tokens the player can hold. When full, oldest tokens are evicted (sliding window) or the player must "commit" (trigger inference) to free space. This is a core mechanic, not a UI detail.
- **Inference events are the reward.** Assembling the correct token sequence (a "prompt") triggers an inference event: a world transition, a mood shift, a new area unlocking, or a narrative beat. The "correct" sequences are defined per-world by the seed.
- **Neuro-prompt (T10) is the meta-layer.** The player can type free text that tweaks world parameters. This is "prompting the world" — the player is literally prompting the neural network. The keyword→param mapping is a simplified NLP layer.
- **Seeds are the network's weights.** Each seed determines the world's structure, mood, token distribution, and correct inference sequences. The seed is the "model" that generates the experience.
- **No text in-world (INV-8).** The theme is tokens/symbols, not words. In-world text would break the illusion. All UI uses glyph icons; any textual feedback is in the HUD overlay (outside the world).

When designing or implementing any feature, ask: "Does this reinforce the tokens/context/inference theme?" If a feature introduces non-token visuals or breaks the context-window metaphor, it needs rework.

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