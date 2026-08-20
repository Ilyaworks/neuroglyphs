# T11 — Curated Seeds, Seed Sharing & Built-in Music

**Status:** todo
**Depends on:** T07
**Files to create/modify:**
- `data/curated-seeds.json` (new — 100 hand-tuned seeds)
- `src/seed/share.js` (new — encode/decode shareable seed codes)
- `src/ui/seedPanel.js` (new — seed input/selection overlay)
- `data/music/` (new — built-in music tracks + metadata)
- `src/audio/builtin.js` (new — built-in track loader)
- `src/main.js` (integrate)
- `.planning/STATE.md`, `.planning/BACKLOG.md` (bookkeeping)

## Goal

Ship the content layer: 100 curated seeds (the "best" worlds), a shareable
seed code system (URL/clipboard), and built-in music tracks. This turns the
procedural engine into a game with a designed experience on top of it.

## Design

### Curated Seeds (100)

- 100 hand-tuned seeds selected for visual quality, variety, and mood spread.
- Each curated seed has:
  - `code` (short shareable string)
  - `name` (glyph-style, no text in-world)
  - `mood` (primary mood)
  - `tags` (e.g., ["vast", "serene", "mercury"])
  - `thumbnail` (optional, generated glyph preview)
- Stored in `data/curated-seeds.json` (data-driven, not hardcoded).
- Curated seeds are the "correct exit" targets (T07).

### Seed Sharing

- Seed code: short, human-readable, URL-safe (e.g., `NG-7F3K-9QZ`).
- Encoding: base seed + collected things → compact code (base32 or similar).
- Shareable via:
  - URL parameter: `?seed=NG-7F3K-9QZ`
  - Clipboard copy
- Loading a seed code → deterministic world (INV-3).
- Invalid codes → random world (no fail state, INV-4).

### Built-in Music

- A small set of built-in tracks (3–5) that work without user upload.
- Each track has metadata:
  - `id`, `name`, `bpm`, `key`, `mood`
  - Used by the music engine (T04) for reactivity.
- Tracks are royalty-free or original (no licensing issues).
- Built-in tracks are the default; user upload (T12) is optional.

### API

```js
// src/seed/share.js
export function encodeSeed(baseSeed, collectedThings) → string
export function decodeSeed(code) → { baseSeed, collectedThings } | null
export function isValidCode(code) → bool

// src/audio/builtin.js
export const BUILTIN_TRACKS = [ { id, name, bpm, key, mood, url } ];
export function loadBuiltinTrack(trackId) → Promise<AudioBuffer>
```

### SeedPanel UI

- Minimal overlay for seed input/selection.
- Glyph-based icons (no text, INV-8).
- Browse curated seeds (grid of glyph previews).
- Enter/paste a seed code.
- Share current seed (copy to clipboard / URL).

## Steps

1. Create `src/seed/share.js` — encode/decode + validation.
2. Create `data/curated-seeds.json` — 100 curated seeds (start with 10, expand).
3. Create `src/ui/seedPanel.js` — seed input/selection overlay.
4. Create `data/music/` + `src/audio/builtin.js` — built-in tracks + loader.
5. Update `src/main.js`: integrate seed panel, URL loading, built-in music.
6. Wire curated seeds into T07 "correct exit" targets.
7. Manual test: share a seed, load it, get the same world (INV-3).
8. Manual test: browse curated seeds, load one, verify quality.
9. Update STATE.md, BACKLOG.md, commit.

## Acceptance Criteria

- [ ] 100 curated seeds in `data/curated-seeds.json` (data-driven).
- [ ] Seed code encoding/decoding is deterministic and reversible.
- [ ] URL parameter `?seed=CODE` loads the correct world.
- [ ] Clipboard copy of current seed works.
- [ ] Invalid seed code → random world (no fail state, INV-4).
- [ ] 3–5 built-in music tracks load and play with metadata.
- [ ] Built-in tracks drive music reactivity (T04).
- [ ] Seed panel is glyph-based, no in-world text (INV-8).
- [ ] Curated seeds are the "correct exit" targets (T07).

## Invariants

- INV-3: one world = one seed, deterministic (seed codes are reversible).
- INV-4: no player death, no fail state (invalid code → random world).
- INV-8: no text in-world (seed panel uses glyph icons).

## Notes

- Start with 10 curated seeds to validate the pipeline, then expand to 100.
- Curated seed selection is a design task: play each seed, rate it, keep
  the best. This is iterative and may span multiple sessions.
- Seed code length vs. entropy: balance short codes with enough variety.
  Base32 of a 128-bit seed + 32-bit collected-things hash is a good start.
- Built-in music tracks need to be small enough for web delivery (~1–3 MB
  each, OGG/MP3). Consider generating them procedurally as a fallback.
- Licensing: ensure all built-in tracks are royalty-free or original.