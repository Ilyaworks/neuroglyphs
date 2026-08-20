# T10 — Neuro-Prompt: Text → World Parameter Tweaks

**Status:** todo
**Depends on:** T03
**Files to create/modify:**
- `src/neuro/prompt.js` (new — text parsing → param tweaks)
- `src/neuro/presets.js` (new — curated prompt presets)
- `src/ui/promptPanel.js` (new — minimal input overlay)
- `src/main.js` (integrate)
- `.planning/STATE.md`, `.planning/BACKLOG.md` (bookkeeping)

## Goal

Allow the player to type a short text prompt that tweaks the current world's
parameters in real-time. The prompt is parsed into a set of parameter
overrides (mood, palette, density, scale, etc.) that are blended into the
world without a full re-seed. This is the "neuro" layer: language shapes
the glyph world.

## Design

### Prompt Format

- Free text, up to ~200 chars.
- Parsed into key-value tweaks using a lightweight keyword→param mapping.
- No external API — all parsing is local and deterministic (INV-3).

### Keyword → Param Mapping

| Keywords | Param | Example |
|----------|-------|---------|
| "dark", "void", "black" | mood → void, fogDensity ↑ | "make it darker" |
| "bright", "joy", "warm" | mood → joyful, palette warm | "make it warm" |
| "dense", "crowded", "full" | particleDensity ↑ | "more particles" |
| "sparse", "empty", "minimal" | particleDensity ↓ | "less noise" |
| "big", "huge", "vast" | worldScale ↑ | "make it bigger" |
| "small", "tight", "close" | worldScale ↓ | "make it tighter" |
| "fast", "quick", "energetic" | particleSpeed ↑ | "speed it up" |
| "slow", "calm", "gentle" | particleSpeed ↓ | "slow it down" |
| "red", "blue", "green", etc. | palette override | "make it red" |
| "fog", "thick", "hazy" | fogDensity ↑ | "thicker fog" |
| "clear", "sharp", "crisp" | fogDensity ↓ | "clearer" |

### Blending

- Prompt tweaks are **additive** to the seeded world params.
- Blend factor: 0.5 (50% prompt, 50% seed) by default.
- Multiple prompts accumulate; a "reset" command clears all prompt tweaks.
- Prompt tweaks do NOT change the seed (INV-3 preserved) — they layer on top.

### Presets

- A small set of curated one-word prompts for quick access:
  - "void", "serene", "chaos", "mercury", "frozen", "bloom"
- Each preset is a pre-defined param tweak set.

### API

```js
// src/neuro/prompt.js
export class NeuroPrompt {
  constructor(worldGen, seedEngine)
  apply(text) → PromptResult
  reset() → void
  getActiveTweaks() → object
  dispose() → void
}

// src/neuro/presets.js
export const PRESETS = {
  void: { mood: 'void', fogDensity: 0.9, particleDensity: 0.1 },
  serene: { mood: 'serene', particleSpeed: 0.3, fogDensity: 0.4 },
  chaos: { mood: 'eerie', particleSpeed: 1.0, particleDensity: 0.9 },
  mercury: { mercuryIntensity: 1.0, particleSpeed: 0.5 },
  frozen: { particleSpeed: 0.0, breathingRate: 0.0 },
  bloom: { bloomIntensity: 1.0, particleDensity: 0.7 }
};
```

### PromptResult

```js
{
  applied: bool,
  tweaks: { param: value, ... },
  message: string  // short feedback, glyph-style (no text in-world)
}
```

### UI

- Minimal overlay: a single-line text input at the bottom of the screen.
- Glyph-based icons for presets (no text labels, INV-8).
- Enter to apply, Esc to close, Backspace to clear.
- Input overlay is semi-transparent, doesn't obstruct the view.

## Steps

1. Create `src/neuro/prompt.js` — keyword parsing + param blending.
2. Create `src/neuro/presets.js` — curated preset definitions.
3. Create `src/ui/promptPanel.js` — minimal text input overlay.
4. Update `src/main.js`: integrate prompt system, bind to keyboard.
5. Manual test: type prompts, verify world changes in real-time.
6. Manual test: presets work, reset works.
7. Update STATE.md, BACKLOG.md, commit.

## Acceptance Criteria

- [ ] Free text prompt parses into param tweaks correctly.
- [ ] Prompt tweaks blend with seeded params (50/50 by default).
- [ ] Prompt tweaks do NOT change the seed (INV-3 preserved).
- [ ] Multiple prompts accumulate; reset clears all.
- [ ] Presets (one-word) work and apply pre-defined tweaks.
- [ ] UI is minimal, glyph-based, no in-world text (INV-8).
- [ ] All parsing is local and deterministic (no external API).

## Invariants

- INV-2: all visuals glyph-based.
- INV-3: one world = one seed, deterministic (prompt tweaks layer on top,
  don't change the seed).
- INV-4: no player death, no fail state (a bad prompt just does nothing).
- INV-8: no text in-world (prompt UI is an overlay, not in-world text).

## Notes

- Keyword mapping should be extensible — keep it in a data-driven table,
  not hardcoded in the parser.
- Prompt tweaks are a "soft" layer: they modify the current world's
  appearance without breaking determinism. The seed is the source of truth;
  prompts are a transient overlay.
- Future: could support a small local NLP model for more natural parsing,
  but v1 uses keyword matching for simplicity and determinism.
- Prompt feedback should be visual (glyph pulse, color shift) not textual.