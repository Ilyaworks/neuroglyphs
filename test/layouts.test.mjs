import { LAYOUTS } from "../src/world/layouts/index.js";
import { decodeSeed } from "../src/core/seed.js";

function fail(msg) {
  console.error("FAIL: " + msg);
  process.exit(1);
}

const PARAMS = { target: 5000, extent: 100 };
const SEED_A = "0000-0000-0000";
const SEED_B = "0000-0000-0001";

function runLayout(layout, seed) {
  const rng = decodeSeed(seed).rng;
  return layout(rng, { ...PARAMS });
}

// 1. Один сид даёт побайтово идентичные positions для всех восьми раскладок
{
  const first = LAYOUTS.map((l) => runLayout(l, SEED_A));
  for (let li = 0; li < LAYOUTS.length; li++) {
    const second = runLayout(LAYOUTS[li], SEED_A);
    if (second.count !== first[li].count) {
      fail("test 1: layout " + li + " count differs " + second.count + " vs " + first[li].count);
    }
    for (let i = 0; i < first[li].positions.length; i++) {
      if (second.positions[i] !== first[li].positions[i]) {
        fail("test 1: layout " + li + " position " + i + " differs " + second.positions[i] + " vs " + first[li].positions[i]);
      }
    }
  }
}

// 2. Разные сиды дают разные positions для всех восьми
{
  const a = LAYOUTS.map((l) => runLayout(l, SEED_A));
  const b = LAYOUTS.map((l) => runLayout(l, SEED_B));
  for (let li = 0; li < LAYOUTS.length; li++) {
    let same = 0;
    const len = Math.min(a[li].positions.length, b[li].positions.length);
    for (let i = 0; i < len; i++) {
      if (a[li].positions[i] === b[li].positions[i]) same++;
    }
    if (a[li].positions.length === b[li].positions.length && same === len) {
      fail("test 2: layout " + li + " identical positions for different seeds");
    }
  }
}

// 3. У всех count > 0 и positions.length === count * 3
{
  const r = LAYOUTS.map((l) => runLayout(l, SEED_A));
  for (let li = 0; li < LAYOUTS.length; li++) {
    if (r[li].count <= 0) fail("test 3: layout " + li + " count is " + r[li].count);
    if (r[li].positions.length !== r[li].count * 3) {
      fail("test 3: layout " + li + " positions.length " + r[li].positions.length + " !== count*3 " + r[li].count * 3);
    }
  }
}

// 4. Ни одного NaN и Infinity
{
  const r = LAYOUTS.map((l) => runLayout(l, SEED_A));
  for (let li = 0; li < LAYOUTS.length; li++) {
    for (let i = 0; i < r[li].positions.length; i++) {
      if (!Number.isFinite(r[li].positions[i])) {
        fail("test 4: layout " + li + " position " + i + " is not finite: " + r[li].positions[i]);
      }
    }
  }
}

// 5. Габариты конечны и не больше 10 000 по любой оси
{
  const r = LAYOUTS.map((l) => runLayout(l, SEED_A));
  for (let li = 0; li < LAYOUTS.length; li++) {
    let mn = [Infinity, Infinity, Infinity];
    let mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < r[li].count; i++) {
      for (let ax = 0; ax < 3; ax++) {
        const v = r[li].positions[i * 3 + ax];
        if (!Number.isFinite(v)) fail("test 5: layout " + li + " non-finite at " + i * 3 + ax);
        if (v < mn[ax]) mn[ax] = v;
        if (v > mx[ax]) mx[ax] = v;
      }
    }
    for (let ax = 0; ax < 3; ax++) {
      if (mx[ax] - mn[ax] > 10000) {
        fail("test 5: layout " + li + " axis " + ax + " extent " + (mx[ax] - mn[ax]) + " > 10000");
      }
    }
  }
}

// 6. Эталонные значения: count и первые 6 координат для фиксированных сидов
{
  const expected = [
    [0, SEED_A, 4992, [-8.02389526, 0.00000000, 6.77252626, -14.15217686, -0.84196192, 13.46534824]],
    [1, SEED_A, 4928, [-3.93786931, -40.51317215, -35.28420258, -2.18569160, -42.19292450, -33.36139679]],
    [2, SEED_A, 4814, [-21.26910973, -43.28323746, -28.72159958, -17.31198120, -43.92932892, -29.41832542]],
    [3, SEED_A, 5003, [0.65823066, -0.22638780, -0.69066286, 0.86009943, -0.83413237, -0.09609035]],
    [4, SEED_A, 4811, [-100.32797241, -100.41931915, -92.63131714, -99.52185822, -100.10879517, -47.88705826]],
    [5, SEED_A, 4932, [34.10023499, -45.17839050, 41.14373016, 34.61555099, -45.19880676, 41.44346237]],
    [6, SEED_A, 5004, [-9.11348629, -25.06586456, -12.35987568, -9.61130333, -25.18839645, -11.26102734]],
    [7, SEED_A, 4966, [-39.99251938, -44.62739563, -7.25690365, -39.18507004, -47.97968674, -2.85871005]],
  ];
  for (const [li, seed, wantCount, wantCoords] of expected) {
    const r = runLayout(LAYOUTS[li], seed);
    if (r.count !== wantCount) {
      fail("test 6: layout " + li + " count is " + r.count + " expected " + wantCount);
    }
    for (let i = 0; i < wantCoords.length; i++) {
      const got = r.positions[i];
      if (Math.abs(got - wantCoords[i]) > 1e-6) {
        fail("test 6: layout " + li + " coord " + i + " is " + got + " expected " + wantCoords[i]);
      }
    }
  }
}

console.log("LAYOUTS_OK");
