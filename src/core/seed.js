// NEUROGLYPHS — T02: Seed Engine
// Deterministic seed → world parameter decoding.
//
// The seed string (lowercase base36, ≤16 chars) encodes 8 world fields
// packed into 66 bits. decodeSeed() extracts the exact field values AND
// derives a deterministic RNG from the same seed for procedural generation.
//
// Fields (total 66 bits):
//   structure    12 bits  (0..4095)  — topology / neural layout archetype
//   mood          6 bits  (0..63)    — emotional register
//   palette      12 bits  (0..4095)  — palette index / hue-shift seed
//   density       6 bits  (0..63)    — glyph density / token pressure
//   fractal       6 bits  (0..63)    — self-similarity / recursion depth
//   motion        6 bits  (0..63)    — motion energy / drift amplitude
//   music        12 bits  (0..4095)  — musical seed (scale, tempo, motif)
//   nonEuclidean  6 bits  (0..63)    — spatial curvature / non-Euclidean warp

import { mulberry32 } from './rng.js';

// ---------------------------------------------------------------------------
// Field definitions (order matters for bit-packing)
// ---------------------------------------------------------------------------
export const FIELDS = [
  { key: 'structure',    bits: 12, min: 0, max: 4095 },
  { key: 'mood',         bits: 6,  min: 0, max: 63 },
  { key: 'palette',      bits: 12, min: 0, max: 4095 },
  { key: 'density',       bits: 6,  min: 0, max: 63 },
  { key: 'fractal',       bits: 6,  min: 0, max: 63 },
  { key: 'motion',        bits: 6,  min: 0, max: 63 },
  { key: 'music',        bits: 12, min: 0, max: 4095 },
  { key: 'nonEuclidean',  bits: 6,  min: 0, max: 63 },
];

/** Max value per field key (for tests and consumers). */
export const GROUP_MAX = Object.fromEntries(FIELDS.map(f => [f.key, f.max]));

const TOTAL_BITS = FIELDS.reduce((s, f) => s + f.bits, 0); // 66
const SEED_LEN = 16; // 16 base36 chars = 83 bits capacity, enough for 66

// ---------------------------------------------------------------------------
// Base36 ↔ BigInt helpers (BigInt has no native base36)
// ---------------------------------------------------------------------------
function base36ToBigInt(s) {
  let val = 0n;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    const d = code >= 97 ? code - 87 : code - 48; // a=10..z=35, 0=0..9=9
    val = val * 36n + BigInt(d);
  }
  return val;
}

function bigIntToBase36(val) {
  if (val === 0n) return '0';
  let s = '';
  while (val > 0n) {
    const rem = Number(val % 36n);
    s = String.fromCharCode(rem < 10 ? 48 + rem : 87 + rem) + s;
    val = (val - BigInt(rem)) / 36n;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Pack / unpack world fields into a single BigInt
// ---------------------------------------------------------------------------
function packFields(w) {
  let val = 0n;
  for (const f of FIELDS) {
    const mask = (1n << BigInt(f.bits)) - 1n;
    val = (val << BigInt(f.bits)) | BigInt(w[f.key] & Number(mask));
  }
  return val;
}

function unpackFields(val) {
  const w = {};
  for (let i = FIELDS.length - 1; i >= 0; i--) {
    const f = FIELDS[i];
    const mask = (1n << BigInt(f.bits)) - 1n;
    w[f.key] = Number(val & mask);
    val >>= BigInt(f.bits);
  }
  return w;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encode world parameters into a seed string (lowercase base36, 16 chars).
 * @param {object} w - world params with keys matching FIELDS
 * @returns {string} seed string
 */
export function encodeSeed(w) {
  const packed = packFields(w);
  let s = bigIntToBase36(packed);
  while (s.length < SEED_LEN) s = '0' + s;
  return s.slice(0, SEED_LEN);
}

/**
 * Decode a seed string into world parameters + a deterministic RNG.
 * The same seed always produces the same world + same RNG sequence.
 * Returns a flat object: { structure, mood, palette, density, fractal, motion, music, nonEuclidean, rng }.
 * @param {string} seed - base36 string (≤16 chars)
 * @returns {object} flat world params + rng function
 */
export function decodeSeed(seed) {
  const s = normalizeSeed(seed);
  const packed = base36ToBigInt(s);
  const world = unpackFields(packed);

  // Derive a deterministic RNG from the seed (for procedural generation
  // that goes beyond the 8 encoded fields — positions, colors, etc.)
  const rngSeed = Number(packed % 2147483647n); // fit into 31-bit int
  const rng = mulberry32(rngSeed);

  return { ...world, rng };
}

/**
 * Generate a random seed string.
 * @param {Function} [rng] - optional deterministic RNG (defaults to Math.random)
 * @returns {string}
 */
export function randomSeed(rng) {
  const rand = rng || Math.random;
  const w = {};
  for (const f of FIELDS) {
    w[f.key] = f.min + Math.floor(rand() * (f.max - f.min + 1));
  }
  return encodeSeed(w);
}

/**
 * Validate a seed string (lowercase alphanumeric, ≤16 chars).
 * @param {string} s
 * @returns {boolean}
 */
export function validateSeed(s) {
  return typeof s === 'string' && /^[a-z0-9]{1,16}$/.test(s);
}

/**
 * Normalize a seed: lowercase, strip non-alphanumeric, truncate to 16.
 * @param {string} s
 * @returns {string}
 */
function normalizeSeed(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, SEED_LEN);
}