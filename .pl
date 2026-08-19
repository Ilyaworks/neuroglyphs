# T03 — Camera rig + player movement + world navigation

**Status:** todo
**Depends on:** T02
**Goal:** First-person / orbital navigation through the glyph field with smooth, responsive controls.

## Steps

1. `src/core/camera-rig.js` — `CameraRig` class:
   - Modes: `fly` (WASD + mouse look), `orbit` (for menu/inspection), `follow` (cinematic).
   - Smooth damping (lerp toward target velocity/rotation).
   - Mouse-look via pointer lock (WASD + mouse for fly).
   - Keyboard: WASD move, Q/E or Space/Shift up/down, Shift sprint, Ctrl slow.
2. `src/core/input.js` — `Input` class:
   - Unified keyboard + mouse state (pressed, held, justPressed).
   - Pointer-lock management; fallback to drag-look when not locked.
   - Action mapping table (configurable).
3. Integrate `CameraRig` into `Engine`:
   - `engine.cameraRig.update(dt)` each frame.
   - Camera position feeds glyph-field uniforms (for billboarding / fog).
4. Collision-free: no solid geometry yet; movement is free-fly.
5. Add a simple "context ring" — a subtle indicator of facing direction / speed.

## Acceptance Criteria

- [ ] WASD + mouse-fly feels smooth (no jitter, consistent speed).
- [ ] Pointer lock engages on click, releases on Esc.
- [ ] Sprint / slow modifiers work.
- [ ] Camera orientation feeds shader billboarding correctly.
- [ ] Orbit mode usable for a future menu (test with a toggle key).
- [ ] No frame-rate-dependent movement (dt-scaled).

## Files Touched

- `src/core/camera-rig.js`, `src/core/input.js`, `src/main.js`

## Notes

- Movement must be dt-scaled to be frame-rate independent.
- Keep input state decoupled from camera logic (testable).
- Pointer lock is essential for immersion; handle the "not locked" state gracefully.
- This rig will be reused for T08 (context focus) and T10 (level transitions).