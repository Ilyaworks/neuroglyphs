# Neuroglyphs

An endless generative kaleidoscope explorer: infinite 3D worlds made entirely of glyphs,
formulas and light. One seed produces one deterministic world; the things you collect fold
back into the seed and shape the next world. Music is the heartbeat — everything pulses and
reacts to it.

> No goal, no victory, no death. Exploration and atmosphere are the point. Every world has
> exactly one rectangular exit; fill its shaped hole correctly and the next world is a
> curated one, ignore it and the next world is random.

Full design: `.planning/CONCEPT.md` (concept v2, adopted 2026-08-20).

## Status

Early. T00–T02 done: boot loop, seeded RNG, glyph alphabet and canvas texture atlas, and the
seed engine (8 world fields bit-packed into a base36 code). T03 (world generator) is next.
Live state: `.planning/STATE.md`. Task queue: `.planning/BACKLOG.md`.

## Quick start

No dependencies and no build step — Three.js r160 comes from a CDN import map.

```bash
npm run dev
```

Open the printed local URL. Add `?seed=abc123` to load a specific world.
`npm test` runs the determinism and seed round-trip checks.

## How agents work on this repo

`AGENTS.md` defines the session protocol and decomposition rules; `.clinerules` holds the
durable project rules, invariants and recurring mistakes (it replaced CLAUDE.md — the
working agent is Qwen via Cline, not Claude Code).

## Layout

- `index.html`, `src/main.js` — entry point, no bundler
- `src/core/` — seeded RNG, seed engine, glyph alphabet, canvas texture atlas
- `src/world/` — world generation (from T03 onward)
- `test/` — plain node test files, run by `npm test`
- `server.js` — static dev server
- `ai/knowledge-graph/` — machine-readable project model
- `.planning/` — concept, backlog, state, per-task files

## License

MIT
