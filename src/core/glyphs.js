// NEUROGLYPHS — glyph alphabet: the single source of truth for which characters
// exist in the world. Mix of latin, digits, greek, math, box-drawing, and CJK.
// Keep this list stable: the atlas grid (glyphTexture.js) is sized from it, and
// world generation indexes into it, so determinism depends on the ordering.
const GLYPH_SET =
  'abcdehkmnprstuvxyz' +
  '0123456789' +
  'αβγδεζηθικλμνξπρστυφχψω' +
  '∂∆∇∑∏∫√∞≈≠≤≥⊕⊗⊥∴∵' +
  'λμσφΩΔΣΠ' +
  'λμσφ' +
  'アイウエオカキクケコサシスセソ' +
  '01<>{}[]()=+*/\\|:;#@$%&';

export const GLYPHS = Array.from(new Set(GLYPH_SET.split('')));

// Palette for the glyph field (see CONCEPT.md "Art Direction").
export const PALETTE = [
  0x58e6d0, // teal accent
  0x9fd0ff, // soft blue
  0x7a86ff, // indigo
  0xd9c8ff, // lavender
  0x334155, // dim slate
];