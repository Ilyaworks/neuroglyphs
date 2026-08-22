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

function toArrays(list) {
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

function solveSpacing(predict, target, lo, hi) {
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const p = predict(mid);
    if (p > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------- layoutNonEuclidean: комнаты с топологией петли ----------
// Тороидальная сетка: сетка на торе с радиусом, пропорциональным extent.
// Число точек решается бинарным поиском по шагу сетки.

function torusGridCount(R, r, spacing) {
  const s = Math.max(0.5, spacing);
  const around = Math.max(4, Math.floor((2 * Math.PI * R) / s));
  const across = Math.max(3, Math.floor((2 * Math.PI * r) / s));
  return around * across;
}

function emitTorus(list, R, r, spacing, baseScale, rng) {
  const s = Math.max(0.5, spacing);
  const around = Math.max(4, Math.floor((2 * Math.PI * R) / s));
  const across = Math.max(3, Math.floor((2 * Math.PI * r) / s));
  const axis = randomUnit(rng);
  const [b, t1, t2] = orthonormal(axis);
  for (let i = 0; i < around; i++) {
    const a = (i / around) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const cx = (b[0] * cosA + t1[0] * sinA) * R;
    const cy = (b[1] * cosA + t1[1] * sinA) * R;
    const cz = (b[2] * cosA + t1[2] * sinA) * R;
    for (let j = 0; j < across; j++) {
      const g = (j / across) * Math.PI * 2;
      const cosG = Math.cos(g);
      const sinG = Math.sin(g);
      const jx = (rng() * 2 - 1) * s * 0.15;
      const jy = (rng() * 2 - 1) * s * 0.15;
      const jz = (rng() * 2 - 1) * s * 0.15;
      pushPoint(
        list,
        cx + (t1[0] * cosG + t2[0] * sinG) * r + jx,
        cy + (t1[1] * cosG + t2[1] * sinG) * r + jy,
        cz + (t1[2] * cosG + t2[2] * sinG) * r + jz,
        baseScale * (0.6 + rng() * 0.8)
      );
    }
  }
}

export function layoutNonEuclidean(rng, params = {}) {
  const target = params.target ?? 20000;
  const extent = params.extent ?? 400;
  const R = extent * 0.5;
  const r = extent * 0.2;
  const baseScale = params.scale || 4;
  const predict = (s) => torusGridCount(R, r, s);
  const spacing = solveSpacing(predict, target, 0.5, 500);
  const list = [];
  emitTorus(list, R, r, spacing, baseScale, rng);
  return toArrays(list);
}

// ---------- layoutCrossedWorlds: две структуры наложены, интерференция ----------
// Две тороидальные структуры на разных осях, наложенные друг на друга.
// Интерференция: масштаб точек зависит от расстояния до центра.

function crossedGridCount(R, r, spacing) {
  const s = Math.max(0.5, spacing);
  const around = Math.max(4, Math.floor((2 * Math.PI * R) / s));
  const across = Math.max(3, Math.floor((2 * Math.PI * r) / s));
  return around * across;
}

function emitCrossed(list, R, r, spacing, baseScale, rng, axisSeed, extent) {
  const s = Math.max(0.5, spacing);
  const around = Math.max(4, Math.floor((2 * Math.PI * R) / s));
  const across = Math.max(3, Math.floor((2 * Math.PI * r) / s));
  const axis = randomUnit(rng);
  const [b, t1, t2] = orthonormal(axis);
  for (let i = 0; i < around; i++) {
    const a = (i / around) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const cx = (b[0] * cosA + t1[0] * sinA) * R;
    const cy = (b[1] * cosA + t1[1] * sinA) * R;
    const cz = (b[2] * cosA + t1[2] * sinA) * R;
    for (let j = 0; j < across; j++) {
      const g = (j / across) * Math.PI * 2;
      const cosG = Math.cos(g);
      const sinG = Math.sin(g);
      const jx = (rng() * 2 - 1) * s * 0.15;
      const jy = (rng() * 2 - 1) * s * 0.15;
      const jz = (rng() * 2 - 1) * s * 0.15;
      const px = cx + (t1[0] * cosG + t2[0] * sinG) * r + jx;
      const py = cy + (t1[1] * cosG + t2[1] * sinG) * r + jy;
      const pz = cz + (t1[2] * cosG + t2[2] * sinG) * r + jz;
      const dist = Math.hypot(px, py, pz);
      const interference = 0.7 + 0.6 * Math.sin(dist / (extent * 0.1) + axisSeed);
      pushPoint(list, px, py, pz, baseScale * (0.6 + rng() * 0.8) * interference);
    }
  }
}

export function layoutCrossedWorlds(rng, params = {}) {
  const target = params.target ?? 20000;
  const extent = params.extent ?? 400;
  const R = extent * 0.5;
  const r = extent * 0.2;
  const baseScale = params.scale || 4;
  const predict = (s) => crossedGridCount(R, r, s) * 2;
  const spacing = solveSpacing(predict, target, 0.5, 500);
  const list = [];
  emitCrossed(list, R, r, spacing, baseScale, rng, 0, extent);
  emitCrossed(list, R, r, spacing, baseScale, rng, Math.PI, extent);
  return toArrays(list);
}
