// Pure layout math for world structures. No Three.js, no DOM, no imports.
// Each layout: (rng, params) -> { positions: Float32Array, scales: Float32Array, count: number }
// rng: () => number in [0, 1). Deterministic: same rng sequence -> identical bytes.

// ---------------------------------------------------------------------------
// worldParams: the single pure source of all seed-driven world decisions.
// Everything a world needs (structure id, particle counts, exit position,
// fog, background, palette) is derived here from the decoded seed, so the
// browser (generator.js) and the node tests (world.test.mjs) share one
// implementation. Returns plain numbers only — no THREE objects.
// ---------------------------------------------------------------------------
export function worldParams(decoded) {
  const rng = decoded.rng;
  const structure = ((decoded.structure % 8) + 8) % 8;
  const density = decoded.density; // 0..63
  const fractal = decoded.fractal; // 0..63
  const motion = decoded.motion; // 0..63
  const paletteSeed = decoded.palette; // 0..4095

  const structureCount = 400 + Math.floor((density / 63) * 2600);
  const particleCount = 3000 + Math.floor((density / 63) * 5000);

  // Exit portal: rectangular frame, always reachable — placed on a ring around
  // the origin well inside the 600-unit far plane, never at the origin.
  const exitAngle = rng() * Math.PI * 2;
  const exitRadius = 60 + rng() * 40;
  const exitY = (rng() - 0.5) * 20;
  const exit = {
    x: Math.cos(exitAngle) * exitRadius,
    y: exitY,
    z: Math.sin(exitAngle) * exitRadius,
    rotY: exitAngle + Math.PI / 2, // frame faces the origin
    hole: Math.floor(rng() * 6), // 0 circle, 1 triangle, 2 star, 3 diamond, 4 hexagon, 5 cross
    width: 8,
    height: 12,
  };

  const bgHue = (paletteSeed % 360) / 360;
  const fogHue = ((paletteSeed >> 5) % 360) / 360;
  const fogDensity = 0.002 + (density / 63) * 0.01;
  const driftAmp = 0.15 + (motion / 63) * 0.5;
  const driftSpeed = 0.1 + (motion / 63) * 0.4;
  const twinkleAmp = 0.25 + (fractal / 63) * 0.4;

  return {
    structure,
    density,
    structureCount,
    particleCount,
    exit,
    bgHue,
    fogHue,
    fogDensity,
    driftAmp,
    driftSpeed,
    twinkleAmp,
  };
}

function makeArrays(count) {
  return {
    positions: new Float32Array(count * 3),
    scales: new Float32Array(count),
    count,
  };
}

function pushPoint(arr, i, x, y, z, s) {
  arr.positions[i * 3] = x;
  arr.positions[i * 3 + 1] = y;
  arr.positions[i * 3 + 2] = z;
  arr.scales[i] = s;
}

// 0: recursively branching corridors made of walls (iterative, explicit stack)
function layoutFractalCorridors(rng, params) {
  const count = params.count || 2000;
  const arr = makeArrays(count);
  let n = 0;

  const stack = [];
  const ang = rng() * Math.PI * 2;
  stack.push({ x: 0, z: 0, dx: Math.cos(ang), dz: Math.sin(ang), depth: 5, len: 6 });
  stack.push({ x: 0, z: 0, dx: 1, dz: 0, depth: 5, len: 6 });

  while (stack.length > 0 && n < count) {
    const { x, z, dx, dz, depth, len } = stack.pop();
    if (depth <= 0) continue;

    const steps = 4;
    for (let i = 0; i < steps && n < count; i++) {
      const t = i / steps;
      const px = x + dx * len * t;
      const pz = z + dz * len * t;
      const ox = -dz * 1.5;
      const oz = dx * 1.5;
      pushPoint(arr, n, px + ox, 0, pz + oz, 0.8 + rng() * 0.4); n++;
      pushPoint(arr, n, px - ox, 0, pz - oz, 0.8 + rng() * 0.4); n++;
    }
    const nx = x + dx * len;
    const nz = z + dz * len;
    const a1 = (rng() - 0.5) * 1.2;
    const a2 = (rng() - 0.5) * 1.2;
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const c2 = Math.cos(a2), s2 = Math.sin(a2);
    if (rng() > 0.5) stack.push({ x: nx, z: nz, dx, dz, depth: depth - 1, len: len * 0.7 });
    stack.push({ x: nx, z: nz, dx: dx * c2 - dz * s2, dz: dx * s2 + dz * c2, depth: depth - 1, len: len * 0.7 });
    stack.push({ x: nx, z: nz, dx: dx * c1 - dz * s1, dz: dx * s1 + dz * c1, depth: depth - 1, len: len * 0.7 });
  }

  return { positions: arr.positions.subarray(0, n * 3), scales: arr.scales.subarray(0, n), count: n };
}

// 1: rooms with loop topology (stub: ring of rooms)
function layoutNonEuclidean(rng, params) {
  const count = params.count || 800;
  const arr = makeArrays(count);
  const rooms = 8;
  const perRoom = Math.floor(count / rooms);
  let n = 0;
  for (let r = 0; r < rooms && n < count; r++) {
    const ang = (r / rooms) * Math.PI * 2;
    const cx = Math.cos(ang) * 20;
    const cz = Math.sin(ang) * 20;
    for (let i = 0; i < perRoom && n < count; i++) {
      pushPoint(arr, n, cx + (rng() - 0.5) * 8, (rng() - 0.5) * 4, cz + (rng() - 0.5) * 8, 0.5 + rng() * 0.5); n++;
    }
  }
  return { positions: arr.positions.subarray(0, n * 3), scales: arr.scales.subarray(0, n), count: n };
}

// 2: angular crystalline formations
function layoutCrystalline(rng, params) {
  const count = params.count || 1500;
  const arr = makeArrays(count);
  let n = 0;
  const clusters = 6;
  const perCluster = Math.floor(count / clusters);
  for (let c = 0; c < clusters && n < count; c++) {
    const cx = (rng() - 0.5) * 60;
    const cy = (rng() - 0.5) * 20;
    const cz = (rng() - 0.5) * 60;
    const baseAng = rng() * Math.PI * 2;
    for (let i = 0; i < perCluster && n < count; i++) {
      // hexagonal lattice with angular jitter
      const ring = Math.floor(i / 6);
      const slot = i % 6;
      const ang = baseAng + (slot / 6) * Math.PI * 2 + ring * 0.5;
      const rad = ring * 2.2 + 0.5;
      const jx = (rng() - 0.5) * 0.4;
      const jy = (rng() - 0.5) * 0.4;
      const jz = (rng() - 0.5) * 0.4;
      pushPoint(arr, n, cx + Math.cos(ang) * rad + jx, cy + jy, cz + Math.sin(ang) * rad + jz, 0.6 + rng() * 0.8); n++;
    }
  }
  return { positions: arr.positions.subarray(0, n * 3), scales: arr.scales.subarray(0, n), count: n };
}

// 3: smooth curved structures (stub: sine ribbons)
function layoutOrganic(rng, params) {
  const count = params.count || 1000;
  const arr = makeArrays(count);
  let n = 0;
  const ribbons = 5;
  const perRibbon = Math.floor(count / ribbons);
  for (let r = 0; r < ribbons && n < count; r++) {
    const phase = rng() * Math.PI * 2;
    const freq = 0.2 + rng() * 0.3;
    const amp = 5 + rng() * 10;
    for (let i = 0; i < perRibbon && n < count; i++) {
      const t = i / perRibbon;
      const x = (t - 0.5) * 80;
      const y = Math.sin(t * Math.PI * 2 * freq * 3 + phase) * amp;
      const z = Math.cos(t * Math.PI * 2 * freq * 2 + phase) * amp;
      pushPoint(arr, n, x, y, z, 0.4 + rng() * 0.4); n++;
    }
  }
  return { positions: arr.positions.subarray(0, n * 3), scales: arr.scales.subarray(0, n), count: n };
}

// 4: sparse clean grid
function layoutGeometric(rng, params) {
  const count = params.count || 500;
  const arr = makeArrays(count);
  let n = 0;
  const side = 8;
  const step = 10;
  for (let x = 0; x < side && n < count; x++) {
    for (let y = 0; y < side && n < count; y++) {
      for (let z = 0; z < side && n < count; z++) {
        if (rng() > 0.3) {
          pushPoint(arr, n, (x - side / 2) * step, (y - side / 2) * step, (z - side / 2) * step, 0.5 + rng() * 0.3); n++;
        }
      }
    }
  }
  return { positions: arr.positions.subarray(0, n * 3), scales: arr.scales.subarray(0, n), count: n };
}

// 5: recognizable but distorted (stub: grid with warp)
function layoutAlmostReal(rng, params) {
  const count = params.count || 700;
  const arr = makeArrays(count);
  let n = 0;
  const side = 9;
  const step = 8;
  for (let x = 0; x < side && n < count; x++) {
    for (let y = 0; y < side && n < count; y++) {
      for (let z = 0; z < side && n < count; z++) {
        const bx = (x - side / 2) * step;
        const by = (y - side / 2) * step;
        const bz = (z - side / 2) * step;
        const d = Math.sqrt(bx * bx + by * by + bz * bz) + 0.001;
        const warp = 2.0 / d;
        pushPoint(arr, n, bx * (1 + warp) + (rng() - 0.5), by * (1 + warp), bz * (1 + warp) + (rng() - 0.5), 0.5 + rng() * 0.4); n++;
      }
    }
  }
  return { positions: arr.positions.subarray(0, n * 3), scales: arr.scales.subarray(0, n), count: n };
}

// 6: void, rare points
function layoutVoid(rng, params) {
  const count = params.count || 120;
  const arr = makeArrays(count);
  let n = 0;
  while (n < count) {
    const r = rng();
    if (r < 0.7) {
      // sparse scattered points in a large volume
      pushPoint(arr, n, (rng() - 0.5) * 120, (rng() - 0.5) * 60, (rng() - 0.5) * 120, 0.3 + rng() * 0.5); n++;
    } else if (r < 0.9) {
      // tiny cluster
      const cx = (rng() - 0.5) * 80;
      const cy = (rng() - 0.5) * 30;
      const cz = (rng() - 0.5) * 80;
      const k = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < k && n < count; i++) {
        pushPoint(arr, n, cx + (rng() - 0.5) * 3, cy + (rng() - 0.5) * 3, cz + (rng() - 0.5) * 3, 0.4 + rng() * 0.3); n++;
      }
    } else {
      // single bright distant point
      pushPoint(arr, n, (rng() - 0.5) * 200, (rng() - 0.5) * 100, (rng() - 0.5) * 200, 1.5 + rng() * 1.0); n++;
    }
  }
  return { positions: arr.positions.subarray(0, n * 3), scales: arr.scales.subarray(0, n), count: n };
}

// 7: two structures overlaid
function layoutCrossedWorlds(rng, params) {
  const count = params.count || 1200;
  const half = Math.floor(count / 2);
  const a = layoutCrystalline(rng, { count: half });
  const b = layoutOrganic(rng, { count: count - half });
  const positions = new Float32Array((a.count + b.count) * 3);
  const scales = new Float32Array(a.count + b.count);
  positions.set(a.positions, 0);
  scales.set(a.scales, 0);
  positions.set(b.positions, a.count * 3);
  scales.set(b.scales, a.count);
  return { positions, scales, count: a.count + b.count };
}

const LAYOUTS = [
  layoutFractalCorridors,
  layoutNonEuclidean,
  layoutCrystalline,
  layoutOrganic,
  layoutGeometric,
  layoutAlmostReal,
  layoutVoid,
  layoutCrossedWorlds,
];

export {
  layoutFractalCorridors,
  layoutNonEuclidean,
  layoutCrystalline,
  layoutOrganic,
  layoutGeometric,
  layoutAlmostReal,
  layoutVoid,
  layoutCrossedWorlds,
  LAYOUTS,
};
