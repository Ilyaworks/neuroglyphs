# T07 - Inference: context drives the network

**Status:** todo
**Depends on:** T04, T06
**Goal:** Feeding the collected context into the network produces visible output.

## Steps

1. src/game/inference.js - map context tokens to input activations.
2. Propagate through the network (simple forward pass).
3. Drive node activation + pulses (T05) from the result.
4. Surface an output signal for gameplay (T09).

## Acceptance Criteria

- [ ] Different contexts produce different network activity.
- [ ] Inference is cheap enough to run per frame.
- [ ] Output is readable by gameplay systems.
