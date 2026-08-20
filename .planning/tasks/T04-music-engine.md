# T04 — Music Engine

**Status:** todo
**Depends on:** T02
**Files to create/modify:**
- `src/audio/musicEngine.js` (new)
- `src/audio/analyser.js` (new)
- `src/audio/builtinMusic.js` (new)
- `src/main.js` (integrate audio, start on first gesture)
- `test/audio.test.mjs` (new — Node-side logic tests only)

## Goal

Real-time audio analysis that drives the visual reactor:
user-uploaded track OR built-in generative drone. Exposes a stable
per-frame snapshot of audio state.

## Design

### Audio Sources

1. **User file:** `AudioContext` + `decodeAudioData` → `BufferSource` → `AnalyserNode`.
   Autoplay policy: start on first user gesture (click / keydown).
2. **Built-in (no file):** generative ambient drone seeded from world seed
   (INV-5): 2–3 detuned oscillators + LFO on filter + slow gain envelope.
   Parameters derived from `params.music` (tempo, key, scale, instrument type).

### Analysis (per frame)

```js
// src/audio/analyser.js — pure functions, unit-testable
export function computeBands(freqData) → { bass, mid, high }       // 0..1
export function detectTempo(energyHistory, sampleRate) → bpm      // simple onset autocorrelation
export function dominantFrequency(freqData, sampleRate, fftSize) → hz
export function estimateMood(bands, tempo, spectralCentroid) → 'serene'|'eerie'|'joyful'|'void'|...
```

### Reactivity Snapshot (what the visual reactor consumes)

```js
{
  active: boolean,          // is audio playing
  bass: 0..1, mid: 0..1, high: 0..1,
  level: 0..1,              // overall RMS
  beat: 0..1,               // 1 at onset, decays
  beatPhase: 0..1,          // position within beat
  bpm: number,
  dominantHz: number,
  mood: string,
  time: seconds
}
```

### API

```js
// src/audio/musicEngine.js
export class MusicEngine {
  constructor()
  async loadFile(file) → void
  startBuiltIn(seedParams) → void
  stop() → void
  update() → snapshot        // call once per frame
  getSnapshot() → snapshot   // last update (for tests / consumers)
}
```

## Steps

1. Create `src/audio/analyser.js` with pure analysis functions.
2. Create `src/audio/builtinMusic.js` — seeded generative drone.
3. Create `src/audio/musicEngine.js` — source management + per-frame update.
4. Create `test/audio.test.mjs`:
   - `computeBands` on synthetic freq data → sane 0..1 values.
   - `detectTempo` on synthetic 120 BPM onset pattern → 110–130.
   - `estimateMood` returns a valid mood string.
   - Built-in music params: same seed → same oscillator frequencies.
5. Update `src/main.js`: create MusicEngine, start on first gesture,
   call `update()` in the render loop, store snapshot for T05.
6. Run `npm test` → all pass.
7. Update STATE.md, BACKLOG.md, commit.

## Acceptance Criteria

- [ ] `npm test` passes (analysis functions + built-in music determinism).
- [ ] Uploading an mp3/wav plays and drives `bass/mid/high` (visible in console snapshot).
- [ ] No file → built-in drone plays, seeded from world seed.
- [ ] Audio starts only after first user gesture (no autoplay errors).
- [ ] `update()` is cheap enough for 60fps (no allocations in hot path beyond snapshot object reuse).

## Invariants

- INV-1: built-in music is seeded (no `Math.random()`).
- INV-5: music drives all pulsation/reactivity; built-in generator active when no file.

## Notes

- Web Audio is browser-only; keep all math in `analyser.js` as pure functions
  so tests run in Node with synthetic data.
- Tempo detection v1: onset envelope + autocorrelation over 2–3s window.
  Good enough for pulsation; refine in T12 if needed.