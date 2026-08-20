# NEUROGLYPHS — Concept

> The single source of truth for *what* the game is and *why*. Mechanics, art direction,
> systems, and open questions. Task files (`tasks/T##`) describe *how* to build slices of
> this. If a task conflicts with this document, update this document first, then the task.

## One-Line Pitch

You are a cursor flying inside a living neural network made entirely of glyphs. You harvest
stray **tokens**, pack them into a bounded **context window**, and — by assembling the right
sequence — fire **inference** that reshapes the world around you.

## The Core Fantasy

The world is not made of rocks and trees; it is made of *meaning*. Every surface is a field of
characters — Latin, Greek, math operators, box-drawing, CJK — drifting like a storm of
half-formed thought. A neural network threads through the field: nodes (neurons) connected by
synapses that carry pulses. You are the attention head. What you *attend* to (collect) is what
the network can *reason about* (infer).

The fantasy is "being the context window of a model that is dreaming." You decide which tokens
the model sees, and the model's output (inference events) rewrites the dream.

## Pillars

1. **Glyphs are the only material.** No meshes with normal textures, no props, no props-with-
   materials. If it's in the scene, it's a character (or a line/point that reads as a symbol).
   This is both the art direction and the performance strategy.
2. **The context window is the player's inventory and the game's core constraint.** It is
   bounded. You cannot hold everything. Eviction (forgetting) is a mechanic, not a bug.
3. **Inference is the verb.** Collecting is passive; *inferring* is the act that changes the
   world. The player's skill is sequence assembly under a bounded budget.
4. **Determinism.** Same seed + same path = same world and same token set. This makes the game
   level-designable, replayable, and testable.

## The World

### Glyph Field
- Thousands of glyph "sprites" (rendered as a single `THREE.Points` cloud with a shared
  canvas texture atlas — see T02/T11) distributed in a shell/volume around a neural core.
- Each glyph has: a character, a position, a scale, a phase (for drift/twinkle), and a color
  from a small palette (teal / soft-blue / indigo / lavender / dim-slate).
- Glyphs drift gently (vertex-shader offset) and twinkle. They are *ambient* until they become
  collectible.

### Neural Network Topology (T04)
- A set of **nodes** (neurons), each a glyph plane, connected by **synapses** (lines) to their
  k-nearest neighbors.
- Nodes are the anchors of the world — the "atoms" the field orbits. Inference events fire from
  nodes.
- The topology is seeded and deterministic.

### Signal Pulses (T05)
- When inference fires, a **pulse** is emitted at the trigger node and travels along synapses
  with a speed and decay. Glyphs near an active synapse brighten / shift hue. The pulse expires
  after N hops. This is the visual "the network thought" feedback.

## Core Loop

1. **Fly** through the glyph field (first-person camera, WASD + mouse-look — T03).
2. **Attend**: approach a highlighted **token** glyph and collect it (contact or `E`).
3. The token is **appended to the context window** (bounded). If full, the **oldest token is
   evicted**.
4. The **inference engine** continuously checks the context for a **target sequence**.
5. When a target sequence is present, an **inference event** fires: the world mutates (a region
   recolors, a new field chunk appears, a gate opens), a stinger plays, a signal pulse
   propagates, and the HUD shows the event.
6. The mutation opens new space / new targets → repeat.

The loop is: *move → collect → (context fills) → infer → world changes → move.*

## Systems

### Context Window (T06)
- A bounded FIFO/queue of tokens (size fixed per level, e.g. 2048 in the demo, but the *game*
  window is much smaller — see Open Questions).
- Operations: `append(token)`, `evictOldest()`, `peek(n)`, `containsSequence(seq)`, `clear()`.
- The context is the player's working memory. Its *contents* and *order* matter.
- **Eviction** is the tension: to fit a long sequence you must manage what you drop.

### Inference Engine (T07)
- A set of **rules** (per level): `targetSequence → effect`.
- `targetSequence` is an ordered list of token glyphs (later: a mini-grammar with wildcards /
  prefix-suffix — see Future Ideas).
- On match: fire the effect (world mutation), consume or keep the matched tokens (design
  decision), emit a signal pulse at the associated node, and record progress.
- Multiple rules can coexist; the engine checks all each frame (cheap, since context is small).

### World Mutation (part of T07 / T10)
- Effects the inference engine can trigger:
  - **Recolor** a region of the field (shift hue of glyphs in a radius).
  - **Spawn** a new field chunk / a new cluster of tokens.
  - **Open a gate** (unlock a new area / a new level region).
  - **Recolor / rebind** a node's glyph.
- Mutations are the "rewards" and the progression driver.

### HUD (T08)
- DOM overlay (not in-scene, except the context ring which is in-scene):
  - **Context window** readout: current tokens / max, with a fill bar.
  - **Token count**, **glyph count**, **FPS**.
  - **Prompts**: contextual hints ("collect the sequence ∂ α Σ to open the gate").
  - **Event messages**: transient line when inference fires.
- The in-scene **context ring** (orbiting glyphs) is a *visual* metaphor for the window; the HUD
  is the *precise* readout.

### Audio (T09)
- **Ambient drone** (low, evolving — the network idling).
- **Collect blip** (short, pitch varies with token).
- **Inference stinger** (distinct, slightly dissonant — "it thought").
- **Pulse tick** (optional, subtle, as signal propagates).
- Must respect autoplay policy: start audio on first user gesture.

### Levels & Progression (T10)
- A **level** = a seed + a set of inference rules + a context-window size + a goal.
- Progression: a level has a **goal** (e.g. "open the final gate" / "reach N inferences").
  Completing it unlocks the next.
- Level data lives in `src/data/levels.js` (seeded, declarative).

## Art Direction

- **Palette:** near-black background (`#05060a`), additive-blended glyphs in teal (`#58e6d0`),
  soft-blue (`#9fd0ff`), indigo (`#7a86ff`), lavender (`#d9c8ff`), dim-slate (`#334155`).
- **Rendering:** additive blending, fog (`FogExp2`) for depth, point sprites for the field,
  glyph planes for nodes/ring. No lighting model needed (emissive look via additive).
- **Mood:** a quiet, vast, half-readable mind. Dense but calm. The player is small inside it.
- **Typography:** monospace (Consolas / SF Mono / Menlo) for HUD and glyph atlas.
- **No non-glyph visuals** unless a task explicitly changes art direction (invariant).

## Controls (target)

| Input | Action |
|-------|--------|
| Mouse (pointer lock) | Look around |
| W / A / S / D | Move forward / left / back / right |
| Shift / Ctrl | Boost / slow (optional) |
| Space | Pulse (demo) / interact (TBD) |
| E | Collect token in range (or auto-collect on contact) |
| Esc | Release pointer lock / pause |

## Tech / Stack

- **Zero-build** for now: `index.html` + `src/*.js` ESM, Three.js r160 via CDN import map,
  `server.js` static server (`npm run dev`). (A Vite build step is a future option — see Open
  Questions.)
- **Modules** (target layout, per `ai/knowledge-graph/project-graph.xml`):
  - `src/core/` — engine, game loop, input, camera.
  - `src/world/` — glyph field, network topology, synapses, signal pulses.
  - `src/systems/` — context window, inference engine, audio.
  - `src/ui/` — DOM HUD.
  - `src/data/` — glyph alphabet, seeded PRNG, level definitions.
- **Determinism:** all world generation routes through a seeded PRNG (`mulberry32` in the demo).
  Never `Math.random()` for world generation.
- **Performance:** the field is one `Points` draw call with a shared atlas; target 60fps @ 5k+
  glyphs (T11).

## Invariants (hard rules)

1. **No `Math.random()`** for world generation — seeded PRNG only.
2. **Rebuilt glyph textures are disposed** (no GPU memory leaks).
3. **Context window size is fixed per level**; overflow handled explicitly (eviction).
4. **All visuals are glyph-based.**
5. **Deterministic collection:** same seed + same player path = same token set.

## Progression / Content Plan (high-level)

- **Demo (now):** one static field, one core, context ring, token accrual on `Space`. Proves the
  look and feel.
- **Playable slice (~1/10 of the full vision):** first-person flight, collect real tokens,
  one inference rule, one world mutation, one level goal. This is the "it's actually a game"
  milestone.
- **Full vision:** multiple levels, a mini token-grammar, several inference "models" with
  different weights, glyph mutation driven by context contents, save system, a narrative thread
  (the model is trying to say something; you're helping it finish the sentence).

## Open Questions

1. **Context window size (game vs demo).** The demo uses 2048 (a "token budget" number). The
   *gameplay* window should be small enough that eviction matters (e.g. 8–32 tokens). What size
   per level, and does it grow?
2. **Collect: contact vs. button.** Auto-collect on contact is smoother; `E` gives deliberate
   control. Which is the feel? (Lean: auto-collect on contact, `E` reserved for interact.)
3. **Sequence semantics.** Is the target a *subsequence* (order matters, gaps allowed) or a
   *contiguous substring* of the context? Does order matter at all, or is it a *set*? (This
   changes the whole feel of the puzzle.)
4. **Consume on infer.** When a sequence matches, do the matched tokens leave the context
   (consumed) or remain (idempotent trigger)? Consumed = more puzzle; remain = more "switch."
5. **Multiple simultaneous rules.** Can several targets be live at once, and does the player
   choose which to satisfy? (Richer, but harder to read in the HUD.)
6. **World mutation scope.** Are mutations local (a region) or global (whole field)? Local feels
   more "network-like"; global feels more "level transition."
7. **Failure state.** Is there a fail state (context overflow = "the model hallucinates" =
   game over / reset), or is it purely exploratory? A fail state adds stakes.
8. **Narrative vs. pure puzzle.** How much story (the model "saying something") vs. pure
   sequence-puzzle? Affects HUD text and pacing.
9. **Build tooling.** Stay zero-build (CDN import map) or adopt Vite for a real `dist/`?
   (Zero-build is fine for a browser demo; Vite helps for larger modules + HMR.)
10. **Scope of "full vision."** What is the *shippable* cut? Recommend: 3 levels, 1 grammar,
    1 narrative beat, save system.

## Non-Goals (for now)

- Multiplayer / networking.
- Mobile / touch controls (low priority; pointer-lock + WASD is the primary target).
- Non-glyph art assets (models, textures, sprites that aren't characters).
- A physics engine (movement is a fly-cam, not a rigid body).

## References

- Knowledge graph: `ai/knowledge-graph/project-graph.xml` (modules, flows, invariants).
- E2E scenarios: `ai/knowledge-graph/e2e-scenarios.yaml` (manual verification flows).
- Agent instructions: `AGENTS.md`, cross-session memory: `CLAUDE.md`.
- Backlog: `.planning/BACKLOG.md`; current state: `.planning/STATE.md`.