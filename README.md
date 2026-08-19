# Neuroglyphs

An indie browser game with a niche glyph aesthetic: a 3D world made entirely of
floating characters where you manipulate tokens inside a finite context window
to complete objectives.

> Working title. The core fantasy: you are a small neural process arranging tokens
> in a limited context to make the network resonate.

## Status

Early scaffolding. See .planning/STATE.md for the live state and
.planning/BACKLOG.md for the task backlog.

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL. npm run build produces a static dist/.

## How agents work on this repo

Read AGENTS.md first - it defines the session protocol, the decomposition rules,
and how to stay in sync with parallel agents. Long-term context lives in CLAUDE.md.

## Layout

- src/ - game source (ES modules, three.js)
- ai/knowledge-graph/ - machine-readable project model
- .planning/ - backlog, state, and per-task files

## License

MIT
