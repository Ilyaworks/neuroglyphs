# T08 - HUD: context window + status

**Status:** todo
**Depends on:** T06
**Goal:** A glyph-styled HUD showing the current context window and status.

## Steps

1. src/ui/hud.js - DOM overlay (or canvas) HUD.
2. Render the context window as a row of tokens with position.
3. Show status: objective, score, context fill.
4. Match the glyph aesthetic (same font/textures).

## Acceptance Criteria

- [ ] HUD shows the live context window.
- [ ] HUD updates without re-allocating per frame.
- [ ] Aesthetic matches the in-world glyphs.
