# T11 - Performance pass: 60fps at scale

**Status:** todo
**Depends on:** T02, T05, T07
**Goal:** Hold 60fps with the full field, network, and pulses on a mid-range machine.

## Steps

1. Profile with the built-in stats HUD (T00).
2. Reduce draw calls (instancing, merged geometry).
3. Cap per-frame allocations; verify with a memory profile.
4. Add a quality setting (glyph count, pulse count, resolution scale).

## Acceptance Criteria

- [ ] 60fps at default quality on a mid-range machine.
- [ ] No sustained GC hitches.
- [ ] Quality setting scales performance predictably.
