// NEUROGLYPHS — T03: World generation tests (node, no three.js)
// Tests pure math: layout determinism, all 8 structure types, exit params.

import { decodeSeed } from '../src/core/seed.js';
import { LAYOUTS, worldParams } from '../src/world/structures.js';

let failures = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL: ' + msg);
    failures++;
  }
}

// --- Test 1: worldParams determinism ---
{
  const a = worldParams(decodeSeed('abc123'));
  const b = worldParams(decodeSeed('abc123'));
  assert(a.structure === b.structure, 'worldParams: structure mismatch');
  assert(a.structureCount === b.structureCount, 'worldParams: structureCount mismatch');
  assert(a.particleCount === b.particleCount, 'worldParams: particleCount mismatch');
  assert(a.exit.x === b.exit.x, 'worldParams: exit.x mismatch');
  assert(a.exit.y === b.exit.y, 'worldParams: exit.y mismatch');
  assert(a.exit.z === b.exit.z, 'worldParams: exit.z mismatch');
  assert(a.exit.hole === b.exit.hole, 'worldParams: exit.hole mismatch');
  assert(a.bgHue === b.bgHue, 'worldParams: bgHue mismatch');
  assert(a.fogDensity === b.fogDensity, 'worldParams: fogDensity mismatch');
}

// --- Test 2: all 8 structure types produce valid finite output ---
for (let s = 0; s < 10; s++) {
  const seedStr = 'test' + s;
  const decoded = decodeSeed(seedStr);
  const wp = worldParams(decoded);
  const layoutFn = LAYOUTS[wp.structure];
  const result = layoutFn(decoded.rng, { count: wp.structureCount });

  assert(result.count > 0, `layout[${wp.structure}] seed=${seedStr}: count=0`);
  assert(result.positions.length === result.count * 3, `layout[${wp.structure}] seed=${seedStr}: positions length mismatch`);
  assert(result.scales.length === result.count, `layout[${wp.structure}] seed=${seedStr}: scales length mismatch`);

  let bad = 0;
  for (let i = 0; i < result.count * 3; i++) {
    if (!Number.isFinite(result.positions[i])) bad++;
  }
  for (let i = 0; i < result.count; i++) {
    if (!Number.isFinite(result.scales[i])) bad++;
  }
  assert(bad === 0, `layout[${wp.structure}] seed=${seedStr}: ${bad} non-finite values`);
}

// --- Test 3: layout determinism (same seed -> same positions) ---
{
  const decoded1 = decodeSeed('det123');
  const decoded2 = decodeSeed('det123');
  const wp1 = worldParams(decoded1);
  const wp2 = worldParams(decoded2);
  const r1 = LAYOUTS[wp1.structure](decoded1.rng, { count: 500 });
  const r2 = LAYOUTS[wp2.structure](decoded2.rng, { count: 500 });

  assert(r1.count === r2.count, 'determinism: count mismatch');
  let diff = 0;
  for (let i = 0; i < r1.count * 3; i++) {
    if (r1.positions[i] !== r2.positions[i]) diff++;
  }
  assert(diff === 0, `determinism: ${diff} position differences`);
}

// --- Test 4: different seeds produce different structures ---
{
  const a = worldParams(decodeSeed('aaaaaa'));
  const b = worldParams(decodeSeed('zzzzzz'));
  // Not guaranteed to differ in every field, but exit position should differ
  const sameExit = a.exit.x === b.exit.x && a.exit.y === b.exit.y && a.exit.z === b.exit.z;
  assert(!sameExit, 'different seeds produced identical exit positions');
}

// --- Test 5: exit is always present and rectangular ---
for (let s = 0; s < 20; s++) {
  const decoded = decodeSeed('exit' + s);
  const wp = worldParams(decoded);
  assert(wp.exit.width > 0, `exit[${s}]: width <= 0`);
  assert(wp.exit.height > 0, `exit[${s}]: height <= 0`);
  assert(wp.exit.hole >= 0 && wp.exit.hole <= 5, `exit[${s}]: hole out of range`);
  const dist = Math.sqrt(wp.exit.x ** 2 + wp.exit.y ** 2 + wp.exit.z ** 2);
  assert(dist > 10, `exit[${s}]: too close to origin (dist=${dist})`);
  assert(dist < 200, `exit[${s}]: too far (dist=${dist})`);
}

// --- Test 6: no Math.random in structures.js ---
import { readFileSync } from 'fs';
import { resolve } from 'path';
const src = readFileSync(resolve('src/world/structures.js'), 'utf8');
assert(!src.includes('Math.random'), 'structures.js contains Math.random()');

if (failures === 0) {
  console.log('WORLD_OK');
} else {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
}
