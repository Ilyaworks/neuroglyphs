// NEUROGLYPHS — determinism smoke test.
// Verifies the core invariant: same seed -> identical world generation stream.
// (Full field layout lives in the browser; here we test the RNG + glyph set
// that world generation depends on.)
import { mulberry32 } from '../src/core/rng.js';
import { GLYPHS } from '../src/core/glyphs.js';

function layout(seed, n) {
  const rng = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = 60 * (0.25 + 0.75 * Math.pow(rng(), 0.6));
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const gi = Math.floor(rng() * GLYPHS.length);
    out.push([r, theta, phi, gi]);
  }
  return out;
}

const SEED = 0x9e3779b9;
const a = layout(SEED, 500);
const b = layout(SEED, 500);
const c = layout(SEED + 1, 500);

let ok = true;
if (JSON.stringify(a) !== JSON.stringify(b)) {
  ok = false;
  console.error('FAIL: same seed produced different layouts');
}
if (JSON.stringify(a) === JSON.stringify(c)) {
  ok = false;
  console.error('FAIL: different seeds produced identical layouts');
}

console.log(ok ? 'DETERMINISM_OK' : 'DETERMINISM_FAIL');
process.exit(ok ? 0 : 1);