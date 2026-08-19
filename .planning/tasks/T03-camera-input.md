# T03 - First-person camera + input (WASD, mouse)

**Status:** todo
**Depends on:** T00
**Goal:** Fly through the glyph field with WASD + pointer-lock mouse look.

## Steps

1. src/core/input.js - keyboard state + pointer-lock mouse look.
2. src/camera/player.js - first-person controller with velocity + damping.
3. Wire into Engine.onFrame.
4. Clamp to world bounds.

## Acceptance Criteria

- [ ] WASD moves, mouse looks, ESC releases pointer lock.
- [ ] Smooth acceleration/deceleration, no jitter.
- [ ] Player is clamped inside the world volume.
