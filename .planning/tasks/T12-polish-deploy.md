# T12 - Polish: menus, save, deploy

**Status:** todo
**Depends on:** T09, T11
**Goal:** A shippable build with menus, persistence, and a public deploy.

## Steps

1. src/ui/menus.js - start/pause/win/lose screens in the glyph aesthetic.
2. Save/load game state to localStorage.
3. npm run build + static hosting (GitHub Pages or similar).
4. Write a short design doc summarizing the core loop.

## Acceptance Criteria

- [ ] Player can start, pause, and restart from menus.
- [ ] Progress persists across reloads.
- [ ] A public URL serves the built game.
