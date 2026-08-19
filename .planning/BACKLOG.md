# BACKLOG

Task queue for NEUROGLYPHS. One task = one session = one file in `tasks/`.
Status: `todo` | `next` (currently scheduled) | `in-progress` | `done` | `blocked`

| ID   | Title                                        | Status  | Task File                          | Depends On |
|------|----------------------------------------------|---------|------------------------------------|------------|
| T00  | Project scaffold: Vite + Three.js boot loop  | done      | tasks/T00-scaffold.md            | —          |
| T01  | Seeded RNG + glyph alphabet + canvas textures| next    | tasks/T01-glyph-textures.md        | T00        |
| T02  | 3D glyph field (instanced, 5k+ glyphs)       | todo    | tasks/T02-glyph-field.md           | T01        |
| T03  | First-person camera + input (WASD, mouse)    | todo    | tasks/T03-camera-input.md          | T00        |
| T04  | Neural network topology (layers, synapses)   | todo    | tasks/T04-network-topology.md      | T02        |
| T05  | Synapse signal pulses                        | todo    | tasks/T05-signal-pulses.md         | T04        |
| T06  | Context window: token collection + eviction  | todo    | tasks/T06-context-window.md        | T02, T03   |
| T07  | Inference engine: sequences + world mutation | todo    | tasks/T07-inference.md             | T05, T06   |
| T08  | HUD: context display, FPS, prompts           | todo    | tasks/T08-hud.md                   | T06        |
| T09  | Audio: ambient drone, blips, stingers        | todo    | tasks/T09-audio.md                 | T06, T07   |
| T10  | Levels + progression (gates, level data)     | todo    | tasks/T10-levels.md                | T07        |
| T11  | Performance pass: 60fps @ 5k glyphs          | todo    | tasks/T11-performance.md           | T02, T04   |
| T12  | Polish: title screen, pause, visual effects  | todo    | tasks/T12-polish.md                | T08, T09   |

## Ordering Notes

- Critical path: T00 -> T01 -> T02 -> T04 -> T05 -> T07 -> T10
- T03, T06, T08 can run in parallel with world tasks (different files).
- T11 is a pass over everything; run after core systems exist.
- T12 last.

## Future Ideas (not yet tasks)

- Token grammar: sequences as mini-language (prefix/suffix rules, wildcards)
- Multiple inference "models" with different weights per level
- Glyph mutation: context contents visually alter nearby field glyphs
- Save system (localStorage)
- Mobile/touch fallback (low priority)