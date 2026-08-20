# NEUROGLYPHS — Concept v2

## One-Line Pitch

Бесконечный генеративный калейдоскоп из символов, формул и звуков.
Собираешь "вещи" → формируешь seed → next world. No goal, no victory.

## Core Fantasy

You fly through an infinite series of abstract worlds made entirely of
glyphs, formulas, and light. Each world is a unique mathematical structure
generated from a seed. You collect "things" (symbols, objects, formulas,
sounds, colors, paths) that become part of your seed. The seed determines
the next world. You can return to old worlds — but they've changed.

## Pillars

1. **Seed = World.** One code → one deterministic, unique world.
2. **Music = Heartbeat.** All visuals pulse, resonate, react to beat/frequency/mood.
3. **No Goal, No Death.** Pure enjoyment. Meditation. Exploration.
4. **Everything is Symbols.** Glyphs, formulas, patterns — the only material.
5. **Worlds are Collectible.** 100 curated seeds + infinite random + share by code.
6. **No Threat.** Player never dies. Can always change world or music.

## Systems

### Seed Engine

- World state encoded as a compact string (base36 or custom alphabet)
- Seed determines: structure type, palette, mood, particle density,
  fractal depth, movement patterns, music params, non-Euclidean params
- 100 curated "best" seeds (hand-picked)
- Player seed = base seed + collected "things" (additive)
- Old worlds re-seed with new player seed → same anchors, new details
- Seed code is shareable: paste → load exact same world

### World Generator

- Structure types (seeded selection):
  - Fractal corridors / labyrinths
  - Non-Euclidean rooms (door → same room, different side)
  - Crystalline formations
  - Organic / flowing architectures
  - Geometric / minimal
  - "Almost real" (uncanny valley — recognizable but distorted)
  - Void / emptiness (defined by absence)
  - Crossed worlds (two structures superimposed, interference patterns)
- Each world has exactly ONE exit: rectangular, with a shaped "hole"
- Exit combination: color + object + sound + formula
- Filling the hole correctly → "best" version of next world (curated seed)
- Ignoring it → random next world
- Optional tasks (no text): pulse-sync collection, color matching, frequency matching
- Tasks understood through: pulsation, color, frequency — never text

### Music Engine

- Load user audio file (Web Audio API, `AudioContext` + `AnalyserNode`)
- Real-time FFT analysis: bass/mid/high energy, dominant frequency
- Tempo detection → pulsation speed
- Harmony/mood analysis → color palette, formula style
- Built-in generative music (if no file loaded): seed-driven ambient drone
- Track name analysis → optional built-in seed association
- Hybrid mode: mix track params with current world seed
- Music drives: pulsation speed, color temperature, particle behavior,
  structure breathing, spectral scattering intensity

### Visual Reactor (music → visuals)

- **Pulsation:** all objects scale/brightness oscillate on beat
- **Spectral scattering:** bass → edge fragmentation, highs → thread emission
- **Rim light:** volumetric outline with flowing color (color drifts over time)
- **Mercury surfaces:** objects flow/refract with sound
- **Scale change:** small → huge on approach (magnification)
- **Echo objects:** flat shadow-phantom with delay (2D silhouette behind)
- **Phase transitions:** solid/liquid/gas in sync with music sections
- **Neuron "hairs":** shivering lines on surfaces (neural network aesthetic)
- **Animated paths:** glyph trail under feet that fades behind player
- **Resonance chains:** nearby objects vibrate sympathetically
- **Pulse ripples:** visible light wave on collect
- **Crystalline growth:** structures grow new branches while observed
- **Fractal zoom-in:** approach → zoom into inner fractal structure
- **Sound made visible:** frequencies as expanding rings/spirals/standing waves

### Atmosphere & Depth

- **Glyph constellations:** brief readable words/formulas, then scatter
- **Breathing geometry:** structures expand/contract with bass
- **Color temperature drift:** warm→cool→warm over minutes
- **Breathing light:** very slow ambient pulse (sleeping creature)
- **Glyph rain/snow:** in some moods, glyphs drift down
- **Interference patterns:** moiré where two worlds cross
- **Scale breathing:** whole world subtly scales up/down
- **Temporal echoes:** ghost frames 2-3s behind (motion-blur ghosting)
- **Vanishing point drift:** perspective slowly shifts
- **Micro-gravity zones:** different particle speeds per zone
- **Depth fog with color:** fog shows "mood" of distance
- **Negative space:** voids, absences, silhouettes
- **Atmospheric density:** "thick" (dense/slow) vs "thin" (sparse/fast) zones
- **Distortion:** local fisheye lenses, space "bubbles", rubbery warping
- **Infinite reflections:** matryoshka inside objects (recursive mirrors)
- **Dynamic shadows:** dance under rhythm, shift away from viewpoint

### Mood System

- Moods seeded per world: serene, eerie, claustrophobic, joyful, void, uncanny
- Eerie: minor key, low freqs → blood-red gradients, torn glyphs
- Claustrophobic: narrowing non-Euclidean corridors, loops
- "Dead" scenarios: frozen particles, synchronized unnatural movement
- Uncanny valley: almost-real with subtle distortions
- Serene: soft gradients, slow pulsation, warm colors
- Joyful: bright, fast, bouncy, high energy
- Void: monochrome, sparse, vast emptiness
- No threat: even "scary" worlds are safe, player can always leave

### Movement

- Fly-cam (WASD + mouse look, pointer lock)
- Shift: boost / Ctrl: slow
- Freeze mode (Tab): third-person, orbit around self, inspect world
- No collision, no gravity
- Smooth acceleration/deceleration (not instant)

### World Transition

- Exit portal (rectangular frame with shaped hole)
- Combination: color + object + sound + formula
- Correct → curated seed (best world)
- Incorrect/ignored → random seed
- Transition animation: world "dissolves" into glyph particles, reforms
- Old worlds: returnable, but re-seeded (anchors stay, details change)
- "Anchors" = major structural elements that persist across re-seeds

### Neuro-Prompt (paid feature)

- Text input → LLM → JSON parameter tweaks
- Changes: palette shift, structure morph, density, mood, movement patterns
- Does NOT generate new models — adjusts existing system params
- "Tuner" metaphor: turns knobs, doesn't build new things
- Stays within existing visual system (no arbitrary image generation)
- Example: "make it more claustrophobic and red" → adjusts corridor width + palette

### Seed Sharing

- Any world → compact code (shareable string)
- Paste code → load exact same world
- 100 curated seeds accessible from menu
- localStorage save of personal seed collection
- "World book": collection of visited/saved worlds

### UI (minimal)

- Menu: Start / Load Seed / Save Seed / Music / Settings
- In-world: minimal HUD (seed code, collected things count, exit proximity)
- No text instructions — all communicated visually/audibly
- Settings: volume, sensitivity, quality, neuro-prompt (paid)
- Audio upload: drag-and-drop or file picker

## Art Direction

- Palette: seeded per world
  - Serene: teal/blue/lavender
  - Eerie: red/crimson/black
  - Void: monochrome (white on black or black on white)
  - Joyful: warm yellows, oranges, pinks
- Rendering: additive blending, fog, point sprites, custom shaders
- Typography: monospace for glyphs
- No non-glyph art assets (invariant)
- All visuals are glyphs, lines, points, or shader effects on glyph geometry
- 3D objects are made of glyph textures on random geometry
- Light is always present (self-illuminating glyphs)

## Tech Stack

- Three.js r160+ (CDN import map, zero-build)
- Web Audio API (AnalyserNode, FFT, tempo detection)
- Custom ESM modules (no bundler)
- Post-processing: EffectComposer + ShaderPass (bloom, fisheye, chromatic aberration)
- Seeded PRNG (mulberry32) — all generation deterministic
- No game engine, no physics engine, no build step
- Static file server (Node.js) for development

## Invariants (hard rules)

1. No `Math.random()` for world generation — seeded PRNG only.
2. All visuals are glyph-based (or shader effects on glyph geometry).
3. One world = one seed. Same seed = same world (deterministic).
4. No player death, no fail state.
5. Music drives all pulsation/reactivity (if no music, built-in generator active).
6. Exit is always rectangular, always findable.
7. Deterministic: same seed + same collected things = same next world.
8. No text in-world (tasks communicated visually/audibly).

## Open Questions

1. Seed encoding format: base36? Custom alphabet? Length? (Target: 8-16 chars)
2. How many "things" can player carry before seed overflows? (Soft cap?)
3. Neuro-prompt: which LLM? API cost? Local model? (Future: paid)
4. Built-in music: how complex? (Ambient drone vs full generative composition)
5. Non-Euclidean: how to implement door→same-room without breaking navigation?
6. 100 curated seeds: who picks them? (Manual playtesting, or algorithmic "aesthetic score"?)
7. Mobile/touch: priority? (Likely low — fly-cam is primary)
8. Performance target: 60fps on mid-range GPU? (Particle count budget?)

## Non-Goals (for now)

- Multiplayer / networking
- Mobile / touch controls
- Non-glyph art assets
- Physics engine
- Traditional game mechanics (combat, inventory management, scoring)
- Narrative / story
- Achievements / leaderboard