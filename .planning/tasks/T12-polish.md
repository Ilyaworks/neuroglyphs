# T12 — Polish: Menu, Settings, Audio Upload & Performance

**Status:** todo
**Depends on:** T08, T09, T10
**Files to create/modify:**
- `src/ui/menu.js` (new — main menu + pause overlay)
- `src/ui/settings.js` (new — settings panel)
- `src/audio/upload.js` (new — user audio file upload)
- `src/perf/manager.js` (new — performance monitor + auto-quality)
- `src/main.js` (integrate)
- `.planning/STATE.md`, `.planning/BACKLOG.md` (bookkeeping)

## Goal

Final polish pass: main menu, settings (quality, volume, sensitivity), user
audio upload, performance monitoring with auto-quality scaling, and general
game-feel tuning. This is the last task before a playable v1 release.

## Design

### Main Menu

- Glyph-based menu (no text, INV-8): icons for Start, Settings, Quit.
- Background: a slowly rotating glyph world (reuses world generator).
- Start → enters the game with a random or curated seed.
- Settings → opens settings panel.

### Settings Panel

| Setting | Type | Default | Range |
|---------|------|---------|-------|
| Quality | enum | auto | low / medium / high / auto |
| Volume | slider | 0.8 | 0..1 |
| Music Volume | slider | 0.8 | 0..1 |
| SFX Volume | slider | 0.8 | 0..1 |
| Mouse Sensitivity | slider | 1.0 | 0.1..3.0 |
| FOV | slider | 75 | 50..120 |
| Bloom Intensity | slider | 1.0 | 0..2 |
| Chromatic Aberration | slider | 1.0 | 0..2 |
| Motion Blur | toggle | on | on / off |
| Vignette | toggle | on | on / off |
| Fullscreen | toggle | off | on / off |
| FPS Counter | toggle | off | on / off |

- Settings persist to `localStorage`.
- Quality presets:
  - low: no post-processing, reduced particles
  - medium: bloom + fisheye, full particles
  - high: all post-processing, full particles, reflections
  - auto: dynamic based on FPS

### User Audio Upload

- File input for audio files (MP3, OGG, WAV, FLAC).
- Loaded via Web Audio API `decodeAudioData`.
- Replaces built-in music; music engine (T04) analyzes the uploaded track.
- No file size limit in code (browser handles it); recommend <10 MB.
- "Use built-in" button to revert to default track.

### Performance Manager

- Monitors FPS (rolling average, 60-frame window).
- Auto-quality: if FPS < 30 for 3 consecutive seconds, drop quality level.
- If FPS > 55 for 10 seconds, try raising quality level.
- Quality levels map to:
  - particle density multiplier
  - post-processing on/off
  - reflection depth
  - shadow quality (if any)
- FPS counter (optional, settings toggle).

### Game Feel

- Camera smoothing (lerp on look, not instant).
- Movement acceleration/deceleration (not instant stop).
- Audio ducking on world transition.
- Fade-in on world load (glyph particles converge).
- Haptic feedback (visual pulse) on interaction.

## Steps

1. Create `src/ui/menu.js` — main menu with glyph icons.
2. Create `src/ui/settings.js` — settings panel with all options.
3. Create `src/audio/upload.js` — user audio file upload + decode.
4. Create `src/perf/manager.js` — FPS monitor + auto-quality.
5. Update `src/main.js`: integrate menu, settings, upload, perf manager.
6. Wire settings to all visual/audio systems.
7. Manual test: menu → game → settings → back to menu.
8. Manual test: upload audio, verify reactivity.
9. Manual test: auto-quality scales correctly on low-end hardware.
10. Update STATE.md, BACKLOG.md, commit.

## Acceptance Criteria

- [ ] Main menu displays with glyph icons (no text, INV-8).
- [ ] Settings panel: all 12 settings work and persist to localStorage.
- [ ] Quality presets (low/medium/high/auto) apply correctly.
- [ ] User audio upload: file loads, decodes, drives music reactivity.
- [ ] "Use built-in" reverts to default track.
- [ ] FPS monitor works; auto-quality scales down/up correctly.
- [ ] FPS counter toggle works.
- [ ] Camera smoothing and movement acceleration feel good.
- [ ] Audio ducks on world transition.
- [ ] Full game loop: menu → play → settings → pause → menu.

## Invariants

- INV-2: all visuals glyph-based (menu, settings use glyph icons).
- INV-4: no player death, no fail state (settings can't break the game).
- INV-8: no text in-world (UI overlays use glyph icons where possible).

## Notes

- Settings persistence: use `localStorage` with a versioned key
  (e.g., `neuroglyphs.settings.v1`) to handle schema changes.
- Audio upload: validate file type before decoding; show a glyph error
  indicator if the file is invalid.
- Auto-quality: be conservative — only change quality on sustained FPS
  deviation, not momentary dips (GC pauses, tab switches).
- Performance target: 60 FPS on medium settings, 30 FPS on low settings,
  60 FPS on high settings for modern GPUs.
- This is the last task. After T12, the game is feature-complete for v1.