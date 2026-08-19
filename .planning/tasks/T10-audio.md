# T10 - Audio: glyph + pulse SFX

**Status:** todo
**Depends on:** T05, T08
**Goal:** Subtle audio tied to tokens, pulses, and objectives.

## Steps

1. src/audio/sfx.js - WebAudio-based SFX (no assets, synthesized).
2. Pickup, eviction, pulse, and win/lose sounds.
3. Master gain + mute toggle.
4. Keep audio cheap and non-blocking.

## Acceptance Criteria

- [ ] SFX play on the relevant events.
- [ ] No audio asset files required (synthesized).
- [ ] Mute toggle works.
