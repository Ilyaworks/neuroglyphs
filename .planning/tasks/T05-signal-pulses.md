# T05 - Synapse signal pulses

**Status:** todo
**Depends on:** T04
**Goal:** Animated pulses traveling along synapses to convey activation.

## Steps

1. src/world/pulses.js - pulse particles that travel along synapse curves.
2. Trigger pulses from node activations (stub API for now).
3. Emissive glow + trail for pulses.
4. Pool pulses, no per-frame allocation.

## Acceptance Criteria

- [ ] Pulses travel smoothly from node to node.
- [ ] Thousands of pulses possible without GC hitches.
- [ ] Pulse speed/intensity tunable.
