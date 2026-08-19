# T06 - Context window: token collection + eviction

**Status:** todo
**Depends on:** T02, T03
**Goal:** The core mechanic: collect tokens into a finite context window.

## Steps

1. src/game/context.js - fixed-size context window (array of tokens).
2. src/game/tokens.js - token entities in the world to collect.
3. Pickup on proximity; oldest token evicted when full.
4. Expose context state for HUD (T08) and inference (T07).

## Acceptance Criteria

- [ ] Collecting a token adds it to context.
- [ ] Window is fixed size; oldest evicted when full.
- [ ] Context state is readable by other systems.
