# T09 - Objectives + win/lose loop

**Status:** todo
**Depends on:** T07, T08
**Goal:** Playable objectives that use context + inference to win or fail.

## Steps

1. src/game/objectives.js - objective definitions (target outputs, sequences).
2. src/game/gameState.js - score, win/lose transitions, restart.
3. Wire inference output to objective checks.
4. Win/lose feedback via HUD + world effects.

## Acceptance Criteria

- [ ] Player can complete an objective and trigger a win.
- [ ] Player can fail an objective.
- [ ] Restart resets context, network, and score cleanly.
