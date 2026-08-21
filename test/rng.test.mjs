import { mulberry32, hash32, strToSeed } from "../src/core/rng.js";

function fail(msg) {
  console.error("FAIL: " + msg);
  process.exit(1);
}

// 1. mulberry32(42) twice gives identical first 1000 values
{
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const va = a();
    const vb = b();
    if (va !== vb) fail("test 1: mulberry32(42) not deterministic at index " + i);
  }
}

// 2. mulberry32(42) and mulberry32(43) differ
{
  const a = mulberry32(42);
  const b = mulberry32(43);
  let same = 0;
  for (let i = 0; i < 1000; i++) {
    if (a() === b()) same++;
  }
  if (same > 10) fail("test 2: seed 42 and 43 too similar, " + same + " equal values");
}

// 3. |corr(hash32(i), hash32(i+1))| < 0.02 over 100 000 values
{
  const N = 100000;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < N; i++) {
    const x = hash32(i);
    const y = hash32(i + 1);
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const cov = sxy / N - (sx / N) * (sy / N);
  const vx = sxx / N - (sx / N) ** 2;
  const vy = syy / N - (sy / N) ** 2;
  const corr = cov / Math.sqrt(vx * vy);
  if (Math.abs(corr) >= 0.02) fail("test 3: correlation " + corr + " not below 0.02");
}

// 4. 3D grid occupancy > 0.70 of 16^3 cells
{
  const N = 20000;
  const cells = new Set();
  for (let i = 0; i < N; i++) {
    const x = Math.min(15, Math.floor(hash32(3 * i) * 16));
    const y = Math.min(15, Math.floor(hash32(3 * i + 1) * 16));
    const z = Math.min(15, Math.floor(hash32(3 * i + 2) * 16));
    cells.add(x * 256 + y * 16 + z);
  }
  const occ = cells.size / 4096;
  if (occ <= 0.70) fail("test 4: occupancy " + occ + " not above 0.70");
}

// 5. reference values from verified code (12 significant digits)
{
  const a = mulberry32(42);
  const refA = [0.601103751920, 0.448290558998, 0.852465793490, 0.669734041439, 0.174813898746];
  for (let i = 0; i < 5; i++) {
    const v = a();
    if (Math.abs(v - refA[i]) >= 5e-13) fail("test 5: mulberry32(42)[" + i + "] = " + v + " expected " + refA[i]);
  }
  const refH = [0.392125141341, 0.367875542957, 0.032725839177, 0.553469189908, 0.487443112535];
  for (let i = 0; i < 5; i++) {
    const v = hash32(i);
    if (Math.abs(v - refH[i]) >= 5e-13) fail("test 5: hash32(" + i + ") = " + v + " expected " + refH[i]);
  }
  const s = strToSeed("NEURO-GLYPH-0001");
  if (s !== 1944663157) fail("test 5: strToSeed = " + s + " expected 1944663157");
}

console.log("RNG_OK");
