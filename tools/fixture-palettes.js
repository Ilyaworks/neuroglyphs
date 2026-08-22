// Эталон для tools/palette-check.mjs: те же шесть настроений, но с контрактом,
// который гейт и стережёт. Отличия от первой версии — ровно те, что перечислены в R20:
// четыре цвета глифа, плотность тумана в единицах сцены, деление на PALETTES.length.
const MOODS = {
  serene: {
    bg: "#04121a",
    fog: "#0a2430",
    fogDensity: 0.0011,
    glyph: ["#2dd4bf", "#38bdf8", "#a78bfa", "#7dd3fc"],
    rim: "#99f6e4",
    accent: "#c4b5fd",
    pulse: 0.35,
  },
  eerie: {
    bg: "#0a0203",
    fog: "#1a0507",
    fogDensity: 0.0018,
    glyph: ["#dc2626", "#991b1b", "#f87171", "#7f1d1d"],
    rim: "#b91c1c",
    accent: "#450a0a",
    pulse: 0.2,
  },
  void: {
    bg: "#010102",
    fog: "#050508",
    fogDensity: 0.0006,
    glyph: ["#9ca3af", "#e5e7eb", "#6b7280", "#f3f4f6"],
    rim: "#d1d5db",
    accent: "#374151",
    pulse: 0.15,
  },
  joyful: {
    bg: "#140b02",
    fog: "#241203",
    fogDensity: 0.0009,
    glyph: ["#facc15", "#fb923c", "#f472b6", "#fde047"],
    rim: "#fde68a",
    accent: "#f9a8d4",
    pulse: 0.9,
  },
  uncanny: {
    bg: "#0b0d10",
    fog: "#14181d",
    fogDensity: 0.0012,
    glyph: ["#86efac", "#67e8f9", "#fda4af", "#a5b4fc"],
    rim: "#94a3b8",
    accent: "#e2e8f0",
    pulse: 0.4,
  },
  claustrophobic: {
    bg: "#030303",
    fog: "#0a0a0a",
    fogDensity: 0.0026,
    glyph: ["#3f3f46", "#52525b", "#71717a", "#27272a"],
    rim: "#52525b",
    accent: "#18181b",
    pulse: 0.5,
  },
};

export { MOODS };

export const PALETTES = Object.keys(MOODS);

export function resolvePalette(seed) {
  const mood = seed.mood % PALETTES.length;
  const base = MOODS[PALETTES[mood]];
  const color = seed.palette % base.glyph.length;
  const glyph = base.glyph.slice(color).concat(base.glyph.slice(0, color));
  return {
    bg: base.bg,
    fog: base.fog,
    fogDensity: base.fogDensity,
    glyph,
    rim: base.rim,
    accent: base.accent,
    pulse: base.pulse,
  };
}
