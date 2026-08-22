const MAX_POINTS = 300000;

function pushPoint(list, x, y, z, s) {
  list.push(x, y, z, s);
}

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function randomUnit(rng) {
  const u = rng() * 2 - 1;
  const v = rng() * 2 - 1;
  const w = rng() * 2 - 1;
  return normalize([u, v, w]);
}

function orthonormal(base) {
  const b = normalize(base);
  const helper = Math.abs(b[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const t1 = normalize([
    b[1] * helper[2] - b[2] * helper[1],
    b[2] * helper[0] - b[0] * helper[2],
    b[0] * helper[1] - b[1] * helper[0],
  ]);
  const t2 = [
    b[1] * t1[2] - b[2] * t1[1],
    b[2] * t1[0] - b[0] * t1[2],
    b[0] * t1[1] - b[1] * t1[0],
  ];
  return [b, t1, t2];
}

function emitGlyphRing(list, center, normal1, normal2, radius, count, scale, rng) {
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / count : 0;
    const a = t * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const nx = normal1[0] * cos + normal2[0] * sin;
    const ny = normal1[1] * cos + normal2[1] * sin;
    const nz = normal1[2] * cos + normal2[2] * sin;
    const jitter = 0.15 * radius;
    const jx = (rng() * 2 - 1) * jitter;
    const jy = (rng() * 2 - 1) * jitter;
    const jz = (rng() * 2 - 1) * jitter;
    pushPoint(
      list,
      center[0] + nx * radius + jx,
      center[1] + ny * radius + jy,
      center[2] + nz * radius + jz,
      scale * (0.7 + rng() * 0.6)
    );
  }
}

function emitWall(list, origin, dir, up, length, height, thickness, glyphSpacing, scale, rng) {
  const right = normalize([
    dir[1] * up[2] - dir[2] * up[1],
    dir[2] * up[0] - dir[0] * up[2],
    dir[0] * up[1] - dir[1] * up[0],
  ]);
  const steps = Math.max(1, Math.floor(length / glyphSpacing));
  const rows = Math.max(1, Math.floor(height / glyphSpacing));
  for (let i = 0; i <= steps; i++) {
    const t = steps > 0 ? i / steps : 0;
    for (let j = 0; j <= rows; j++) {
      const u = rows > 0 ? j / rows : 0;
      const side = rng() < 0.5 ? -1 : 1;
      const off = thickness * 0.5 * side;
      const px = origin[0] + dir[0] * t * length + right[0] * off;
      const py = origin[1] + dir[1] * t * length + right[1] * off;
      const pz = origin[2] + dir[2] * t * length + right[2] * off;
      const hx = px + up[0] * u * height;
      const hy = py + up[1] * u * height;
      const hz = pz + up[2] * u * height;
      pushPoint(list, hx, hy, hz, scale * (0.6 + rng() * 0.8));
    }
  }
}

function buildCorridorTree(root, rng) {
  const tree = [root];
  const stack = [root];
  while (stack.length) {
    const c = stack.pop();
    if (c.depthLeft === 0) continue;
    const branches = 1 + Math.floor(rng() * 2);
    const [b, t1, t2] = orthonormal(c.dir);
    for (let i = 0; i < branches; i++) {
      const bend = 0.5 + rng() * 0.9;
      const axis = i === 0 ? t1 : t2;
      const sign = rng() < 0.5 ? -1 : 1;
      const nd = normalize([
        c.dir[0] + axis[0] * bend * sign,
        c.dir[1] + axis[1] * bend * sign,
        c.dir[2] + axis[2] * bend * sign,
      ]);
      const end = [c.origin[0] + c.dir[0] * c.length, c.origin[1] + c.dir[1] * c.length, c.origin[2] + c.dir[2] * c.length];
      const child = {
        origin: end,
        dir: nd,
        length: c.length * (0.55 + rng() * 0.25),
        radius: c.radius * (0.6 + rng() * 0.25),
        scale: c.scale * 0.85,
        depthLeft: c.depthLeft - 1,
      };
      tree.push(child);
      stack.push(child);
    }
  }
  return tree;
}

function emitCorridor(list, c, spacing, rng) {
  const [b, t1, t2] = orthonormal(c.dir);
  const wallH = c.radius * 2.2;
  const wallT = c.radius * 0.6;
  emitWall(list, [c.origin[0] - t1[0] * c.radius, c.origin[1] - t1[1] * c.radius, c.origin[2] - t1[2] * c.radius], c.dir, t2, c.length, wallH, wallT, spacing, c.scale, rng);
  emitWall(list, [c.origin[0] + t1[0] * c.radius, c.origin[1] + t1[1] * c.radius, c.origin[2] + t1[2] * c.radius], c.dir, t2, c.length, wallH, wallT, spacing, c.scale, rng);
  emitWall(list, [c.origin[0] - t2[0] * c.radius, c.origin[1] - t2[1] * c.radius, c.origin[2] - t2[2] * c.radius], c.dir, t1, c.length, wallH, wallT, spacing, c.scale, rng);
  emitWall(list, [c.origin[0] + t2[0] * c.radius, c.origin[1] + t2[1] * c.radius, c.origin[2] + t2[2] * c.radius], c.dir, t1, c.length, wallH, wallT, spacing, c.scale, rng);
  emitGlyphRing(list, [c.origin[0] + c.dir[0] * c.length, c.origin[1] + c.dir[1] * c.length, c.origin[2] + c.dir[2] * c.length], t1, t2, c.radius, 16, c.scale * 1.4, rng);
}

export function layoutFractalCorridors(rng, params = {}) {
  const target = params.target ?? 20000;
  const radius = params.radius || 60;
  const depth = params.depth ?? 2;
  const corridorLength = params.corridorLength || 180;
  const baseScale = params.scale || 4;
  const main = randomUnit(rng);
  const root = { origin: [0, 0, 0], dir: main, length: corridorLength, radius, scale: baseScale, depthLeft: depth };
  const tree = buildCorridorTree(root, rng);
  let totalArea = 0;
  for (const c of tree) {
    totalArea += 4 * c.length * (c.radius * 2.2);
  }
  const spacing = Math.sqrt(totalArea / target);
  const list = [];
  for (const c of tree) {
    emitCorridor(list, c, spacing * (0.8 + rng() * 0.6), rng);
  }
  const count = Math.min(MAX_POINTS, list.length / 4);
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = list[i * 4];
    positions[i * 3 + 1] = list[i * 4 + 1];
    positions[i * 3 + 2] = list[i * 4 + 2];
    scales[i] = list[i * 4 + 3];
  }
  return { positions, scales, count };
}

function emitCrystal(list, center, size, rng) {
  const axis = randomUnit(rng);
  const [b, t1, t2] = orthonormal(axis);
  const facets = 5 + Math.floor(rng() * 4);
  const height = size * (1.5 + rng() * 1.5);
  const rings = 4 + Math.floor(rng() * 4);
  for (let r = 0; r < rings; r++) {
    const t = rings > 1 ? r / (rings - 1) : 0;
    const y = (t - 0.5) * height;
    const rad = size * (1 - Math.abs(t - 0.5) * 1.6);
    if (rad <= 0) continue;
    const per = Math.max(3, Math.floor(facets * (0.6 + rng() * 0.6)));
    for (let i = 0; i < per; i++) {
      const a = (i / per) * Math.PI * 2 + rng() * 0.4;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const px = center[0] + (t1[0] * cos + t2[0] * sin) * rad + b[0] * y;
      const py = center[1] + (t1[1] * cos + t2[1] * sin) * rad + b[1] * y;
      const pz = center[2] + (t1[2] * cos + t2[2] * sin) * rad + b[2] * y;
      pushPoint(list, px, py, pz, size * (0.25 + rng() * 0.35));
    }
  }
  pushPoint(list, center[0] + b[0] * height * 0.5, center[1] + b[1] * height * 0.5, center[2] + b[2] * height * 0.5, size * 0.5);
  pushPoint(list, center[0] - b[0] * height * 0.5, center[1] - b[1] * height * 0.5, center[2] - b[2] * height * 0.5, size * 0.5);
}

export function layoutCrystalline(rng, params = {}) {
  const target = params.target ?? 20000;
  const count = params.count ?? Math.max(1, Math.round(target / 32));
  const radius = params.radius || 200;
  const baseSize = params.size || 10;
  const list = [];
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1;
    const v = rng() * 2 - 1;
    const w = rng() * 2 - 1;
    const len = Math.hypot(u, v, w) || 1;
    const rad = radius * Math.cbrt(rng());
    const center = [(u / len) * rad, (v / len) * rad, (w / len) * rad];
    const size = baseSize * (0.5 + rng() * 1.5);
    emitCrystal(list, center, size, rng);
  }
  const n = Math.min(MAX_POINTS, list.length / 4);
  const positions = new Float32Array(n * 3);
  const scales = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = list[i * 4];
    positions[i * 3 + 1] = list[i * 4 + 1];
    positions[i * 3 + 2] = list[i * 4 + 2];
    scales[i] = list[i * 4 + 3];
  }
  return { positions, scales, count: n };
}

export function layoutGeometric(rng, params = {}) {
  const target = params.target ?? 20000;
  const occupancy = params.occupancy ?? 0.22;
  const grid = params.grid ?? Math.max(4, Math.round(Math.cbrt(target / occupancy)) - 1);
  const extent = params.extent || 300;
  const spacing = extent / grid;
  const baseScale = params.scale || 3;
  const list = [];
  for (let x = 0; x <= grid; x++) {
    for (let y = 0; y <= grid; y++) {
      for (let z = 0; z <= grid; z++) {
        if (rng() < occupancy) {
          const px = (x - grid / 2) * spacing + (rng() * 2 - 1) * spacing * 0.08;
          const py = (y - grid / 2) * spacing + (rng() * 2 - 1) * spacing * 0.08;
          const pz = (z - grid / 2) * spacing + (rng() * 2 - 1) * spacing * 0.08;
          pushPoint(list, px, py, pz, baseScale * (0.8 + rng() * 0.5));
        }
      }
    }
  }
  const n = Math.min(MAX_POINTS, list.length / 4);
  const positions = new Float32Array(n * 3);
  const scales = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = list[i * 4];
    positions[i * 3 + 1] = list[i * 4 + 1];
    positions[i * 3 + 2] = list[i * 4 + 2];
    scales[i] = list[i * 4 + 3];
  }
  return { positions, scales, count: n };
}
