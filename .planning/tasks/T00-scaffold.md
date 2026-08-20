# T00 — Project scaffold: Three.js boot loop

> **Historical note (2026-08-20):** this file describes the originally planned Vite
> scaffold. What was actually shipped is a zero-build setup — Three.js r160 through a
> CDN import map in `index.html`, served by `server.js` (`npm run dev`). There is no
> Vite, no bundler and no dependencies. Read the stack from `AGENTS.md`, not from here.

**Status:** in-progress
**Depends on:** —
**Goal:** A runnable Vite + Three.js project that renders a rotating wireframe cube with an FPS counter, proving the toolchain works end-to-end.

## Steps

1. `npm init -y`, add `vite` (dev) and `three` (dep).
2. `package.json` scripts: `dev` (vite), `build` (vite build), `preview`.
3. `index.html` — full-screen canvas, no scrollbars, dark background.
4. `src/main.js` — entry: create renderer/scene/camera, animate loop via `requestAnimationFrame`, handle resize.
5. `src/core/engine.js` — `Engine` class encapsulating renderer, scene, camera, clock; `start()`, `stop()`, `onFrame(callback)`.
6. Temporary scene content: wireframe icosahedron + point-light starfield placeholder.
7. FPS counter in corner (simple text, no library).
8. Commit.

## Acceptance Criteria

- [ ] `npm install && npm run dev` boots a page with a 3D scene at 60fps.
- [ ] `npm run build` produces a working `dist/`.
- [ ] Resize keeps aspect ratio correct, no stretching.
- [ ] Engine class is the single place for the render loop.
- [ ] No console errors/warnings.

## Files Touched

- `package.json`, `index.html`, `src/main.js`, `src/core/engine.js`

## Notes

- Keep the scaffold minimal — every later task builds on `Engine`.
- Use ES modules throughout (Vite handles it).
- Pin `three` version in package.json; update deliberately, not implicitly.