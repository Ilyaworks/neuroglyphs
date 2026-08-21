# BACKLOG — NEUROGLYPHS (Concept v2)

> Concept v2 adopted 2026-08-20. Old token/inference concept (T02–T12 v1) is DEPRECATED —
> those task files were replaced. See `.planning/CONCEPT.md` for the full design.

| ID   | Title                                            | Status | Task File                       | Depends On |
|------|--------------------------------------------------|--------|---------------------------------|------------|
| T00  | Project scaffold: Three.js boot loop             | done   | tasks/T00-scaffold.md           | —          |
| T01  | Seeded RNG + glyph alphabet + canvas textures    | done   | tasks/T01-glyph-textures.md     | T00        |
| T02  | Seed engine: encode/decode, world params         | done   | tasks/T02-seed-engine.md        | T01        |
| T03  | World generator v1: structures + particles       | done   | tasks/T03-world-gen.md          | T02        |
| T04  | Music engine: Web Audio, FFT, reactivity hooks   | todo   | tasks/T04-music-engine.md       | T02        |
| T05  | Visual reactor: pulsation, rim light, spectral   | todo   | tasks/T05-visual-reactor.md     | T03, T04   |
| T06  | Movement: fly-cam + freeze/inspect mode          | todo   | tasks/T06-movement.md           | T03        |
| T07  | World transition: exit portal + re-seed          | todo   | tasks/T07-transition.md         | T05, T06   |
| T08  | Advanced visuals: reflections, distortion, mercury | todo | tasks/T08-advanced-visuals.md | T05        |
| T09  | Mood system: palettes + behavior per mood        | todo   | tasks/T09-mood-system.md        | T03        |
| T10  | Neuro-prompt: text → JSON parameter tweaks       | todo   | tasks/T10-neuro-prompt.md       | T03        |
| T11  | Curated seeds (100) + seed sharing + built-in music | todo | tasks/T11-seeds-sharing.md   | T07        |
| T12  | Polish: menu, settings, audio upload, perf       | todo   | tasks/T12-polish.md             | T08, T09, T10 |
| T13  | New shapes: glyph-core+ring, geometry, space     | done   | tasks/T13-shapes-v2.md          | T03        |
| T14  | 64 new shapes from user descriptions (4 families) | done  | tasks/T14-shapes-v3.md          | T13        |

## Ordering Notes

- **Critical path:** T02 → T03 → T05 → T07 → T11
- T04, T06, T09 can run in parallel (different files, minimal coupling)
- T08, T10 after core visuals exist
- T12 last
- Each task = one session. Update STATE.md + this file at the end of each session.

## Parallel-Work Protocol

Multiple agents may work different tasks simultaneously:
- One task file = one session = one branch (or sequential commits on main if non-conflicting).
- Never edit the same file as another in-flight task unless the task file says so.
- `src/core/*` is shared infrastructure — changes there require updating
  `test/determinism.test.mjs` and re-running it.
- After each session: update STATE.md, BACKLOG.md status, commit, push.