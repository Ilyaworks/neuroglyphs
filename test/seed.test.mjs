// NEUROGLYPHS — T02 seed engine tests.
// Verifies: determinism, round-trip encode/decode, validation, randomSeed validity.
import { encodeSeed, decodeSeed, randomSeed, validateSeed, GROUP_MAX } from '../src/core/seed.js';
import { mulberry32 } from '../src/core/rng.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
}

// 1. Determinism: decodeSeed twice -> identical params.
{
  const a = decodeSeed('test123abc');
  const b = decodeSeed('test123abc');
  assert(JSON.stringify(a) === JSON.stringify(b), 'decodeSeed is deterministic');
}

// 2. Different seeds -> different params (sanity).
{
  const a = decodeSeed('aaaaaaaaaa');
  const b = decodeSeed('zzzzzzzzzz');
  assert(JSON.stringify(a) !== JSON.stringify(b), 'different seeds differ');
}

// 3. The returned rng is deterministic and NOT Math.random.
{
  const d1 = decodeSeed('abc');
  const d2 = decodeSeed('abc');
  const s1 = [d1.rng(), d1.rng(), d1.rng()];
  const s2 = [d2.rng(), d2.rng(), d2.rng()];
  assert(JSON.stringify(s1) === JSON.stringify(s2), 'rng stream is deterministic per seed');
  // distinct seeds give distinct streams
  const d3 = decodeSeed('abd');
  const s3 = [d3.rng(), d3.rng(), d3.rng()];
  assert(JSON.stringify(s1) !== JSON.stringify(s3), 'rng stream differs across seeds');
}

// 4. Round-trip: decodeSeed(encodeSeed(params)) -> same params.
{
  const params = {
    structure: 4095, mood: 63, palette: 4095, density: 63,
    fractal: 63, motion: 63, music: 4095, nonEuclidean: 63,
  };
  const enc = encodeSeed(params);
  const dec = decodeSeed(enc);
  for (const k of Object.keys(params)) {
    assert(dec[k] === params[k], `round-trip field ${k} (${dec[k]} !== ${params[k]})`);
  }
  assert(enc.length <= 16, 'encoded seed <= 16 chars');
  assert(/^[0-9a-z]+$/.test(enc), 'encoded seed is base36 lowercase');
}

// 5. Round-trip with in-range random values.
{
  const rng = mulberry32(0x1234);
  for (let i = 0; i < 200; i++) {
    const params = {};
    for (const k of Object.keys(GROUP_MAX)) params[k] = Math.floor(rng() * (GROUP_MAX[k] + 1));
    const dec = decodeSeed(encodeSeed(params));
    for (const k of Object.keys(params)) {
      assert(dec[k] === params[k], `random round-trip field ${k}`);
    }
  }
}

// 6. Validation.
{
  assert(validateSeed('test123abc') === true, 'valid seed accepted');
  assert(validateSeed('!!!!') === false, 'non-base36 rejected');
  assert(validateSeed('') === false, 'empty rejected');
  assert(validateSeed('a'.repeat(17)) === false, '>16 chars rejected');
  assert(validateSeed('a'.repeat(16)) === true, '16 chars accepted');
  assert(validateSeed('ABC123') === false, 'uppercase rejected (must be lowercase)');
  assert(validateSeed(12345) === false, 'non-string rejected');
}

// 7. randomSeed produces valid, decodable seeds; deterministic given an rng.
{
  const r1 = mulberry32(7);
  const r2 = mulberry32(7);
  const s1 = randomSeed(r1);
  const s2 = randomSeed(r2);
  assert(validateSeed(s1), 'randomSeed is valid');
  assert(s1 === s2, 'randomSeed deterministic given same rng');
  const dec = decodeSeed(s1);
  assert(typeof dec.structure === 'number' && typeof dec.rng === 'function', 'randomSeed decodes');
}

if (failures === 0) {
  console.log('SEED_OK');
  process.exit(0);
} else {
  console.error('SEED_FAIL (' + failures + ' assertions)');
  process.exit(1);
}