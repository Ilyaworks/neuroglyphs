# T07 — World Transition & Re-seed

**Status:** todo
**Depends on:** T05, T06
**Files to create/modify:**
- `src/world/transition.js` (new)
- `src/world/exit.js` (new — rectangular portal + shaped hole)
- `src/main.js` (integrate transition + re-seed)
- `.planning/STATE.md`, `.planning/BACKLOG.md` (bookkeeping)

## Goal

Implement the single exit portal per world, the dissolve→reform transition
animation, and re-seeding of visited worlds (anchors persist, details change).
This is the core loop of the game: collect → exit → next world.

## Design

### Exit Portal

- Exactly ONE exit per world (INV-6), always rectangular, always findable.
- A rectangular frame with a shaped "hole" inside (color + object + sound +
  formula combination).
- The combination is derived from the seed (deterministic).
- Proximity indicator in HUD (T06) hints at exit direction/distance.

### Combination Logic

- Correct combination → load a **curated** (best) seed for the next world.
- Incorrect or ignored → load a **random** seed.
- No fail state (INV-4): a wrong exit is never a penalty, just a different world.

### Transition Animation

- World "dissolves" into glyph particles, then reforms as the next world.
- Driven by the visual reactor (T05) so it pulses with the music.
- Duration is short (~1–2s) and skippable.

### Re-seed (old worlds)

- Visited worlds are returnable but re-seeded with the current player seed.
- **Anchors** = major structural elements that persist across re-seeds.
- Same anchors, new details → "the world changed but I recognize it."

### Player Seed

- Player seed = base seed + collected "things" (additive).
- Collected things feed the next seed deterministically (INV-7).

### API

```js
// src/world/transition.js
export class Transition {
  constructor(scene, worldGen, seedEngine)
  startNext(seedCode) → void
  update(dt) → void
  isTransitioning() → bool
  dispose() → void
}

// src/world/exit.js
export class ExitPortal {
  constructor(worldParams, seedEngine)
  getGroup() → THREE.Group
  checkCombination(playerInput) → 'correct' | 'random'
  update(dt) → void
  dispose() → void
}
```

## Steps

1. Create `src/world/exit.js` — rectangular frame + shaped hole + combination.
2. Create `src/world/transition.js` — dissolve/reform + re-seed logic.
3. Update `src/main.js`: spawn exit per world, handle transition on exit.
4. Wire collected "things" → player seed → next seed.
5. Manual test: exit correctly (curated), exit wrong (random), return to old world (re-seeded).
6. Update STATE.md, BACKLOG.md, commit.

## Acceptance Criteria

- [ ] Exactly one rectangular exit per world, always findable.
- [ ] Correct combination → curated next world; wrong/ignored → random.
- [ ] Transition dissolves world into glyph particles and reforms the next.
- [ ] Returning to an old world re-seeds it (anchors persist, details change).
- [ ] Player seed = base + collected things, deterministic (INV-7).
- [ ] No fail state on a wrong exit (INV-4).

## Invariants

- INV-3: one world = one seed, deterministic.
- INV-4: no player death, no fail state.
- INV-6: exit is always rectangular, always findable.
- INV-7: same seed + same collected things = same next world.

## Notes

- Anchor persistence needs a stable structural hash per world (major elements
  keyed off the base seed, not the full player seed).
- Curated-seed selection for "correct" exits depends on T11's seed table;
  for now use a small placeholder set of curated seeds.