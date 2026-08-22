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

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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

// ---------- layoutOrganic: плавные текучие архитектуры ----------

function buildFlowRibbon(rng, length, thickness, segments) {
  const pts = [[0, 0, 0]];
  let dir = randomUnit(rng);
  for (let i = 1; i <= segments; i++) {
    const bend = 0.35 + rng() * 0.55;
    const axis = randomUnit(rng);
    const nd = normalize([
      dir[0] + axis[0] * bend,
      dir[1] + axis[1] * bend,
      dir[2] + axis[2] * bend,
    ]);
    const prev = pts[i - 1];
    const segLen = length / segments;
    pts.push([
      prev[0] + nd[0] * segLen,
      prev[1] + nd[1] * segLen,
      prev[2] + nd[2] * segLen,
    ]);
    dir = nd;
  }
  return { pts, length, thickness };
}

function ribbonPointCount(ribbon, spacing) {
  const s = Math.max(0.5, spacing);
  const steps = Math.max(1, Math.floor(ribbon.length / s));
  const per = Math.max(4, Math.round((ribbon.thickness * 2) / s) + 4);
  return (steps + 1) * per;
}

function emitRibbon(list, ribbon, spacing, baseScale, rng) {
  const s = Math.max(0.5, spacing);
  const steps = Math.max(1, Math.floor(ribbon.length / s));
  const per = Math.max(4, Math.round((ribbon.thickness * 2) / s) + 4);
  for (let i = 0; i <= steps; i++) {
    const t = steps > 0 ? i / steps : 0;
    const idx = t * (ribbon.pts.length - 1);
    const i0 = Math.min(ribbon.pts.length - 1, Math.floor(idx));
    const i1 = Math.min(ribbon.pts.length - 1, i0 + 1);
    const center = lerp(ribbon.pts[i0], ribbon.pts[i1], idx - i0);
    const tangent = normalize([
      ribbon.pts[i1][0] - ribbon.pts[i0][0],
      ribbon.pts[i1][1] - ribbon.pts[i0][1],
      ribbon.pts[i1][2] - ribbon.pts[i0][2],
    ]);
    const [b, t1, t2] = orthonormal(tangent);
    const th = ribbon.thickness * (0.55 + 0.45 * Math.sin(t * Math.PI));
    for (let k = 0; k < per; k++) {
      const a = (k / per) * Math.PI * 2 + t * 2.5;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const jx = (rng() * 2 - 1) * th * 0.25;
      const jy = (rng() * 2 - 1) * th * 0.25;
      const jz = (rng() * 2 - 1) * th * 0.25;
      pushPoint(
        list,
        center[0] + (t1[0] * cos + t2[0] * sin) * th + jx,
        center[1] + (t1[1] * cos + t2[1] * sin) * th + jy,
        center[2] + (t1[2] * cos + t2[2] * sin) * th + jz,
        baseScale * (0.6 + rng() * 0.8)
      );
    }
  }
}

export function layoutOrganic(rng, params = {}) {
  const target = params.target ?? 20000;
  const extent = params.extent ?? 400;
  const ribbonCount = params.ribbons ?? 6;
  const ribbonLength = params.length || extent * 1.0;
  const thickness = params.thickness || extent * 0.035;
  const baseScale = params.scale || 4;
  const ribbons = [];
  for (let i = 0; i < ribbonCount; i++) {
    const r = buildFlowRibbon(rng, ribbonLength * (0.6 + rng() * 0.8), thickness * (0.6 + rng() * 0.9), 14);
    ribbons.push(r);
  }
  const predict = (s) => ribbons.reduce((n, r) => n + ribbonPointCount(r, s), 0);
  const spacing = solveSpacing(predict, target, 0.5, 500);
  const list = [];
  for (const r of ribbons) emitRibbon(list, r, spacing, baseScale, rng);
  return toArrays(list);
}

// ---------- layoutAlmostReal: аркады, колоннады, лестницы ----------

function emitArchRowDirect(list, origin, right, dir, up, bays, bayWidth, archHeight, perArch, perCol, baseScale, rng) {
  for (let b = 0; b < bays; b++) {
    const cx = origin[0] + dir[0] * (b + 0.5) * bayWidth;
    const cy = origin[1] + dir[1] * (b + 0.5) * bayWidth;
    const cz = origin[2] + dir[2] * (b + 0.5) * bayWidth;
    for (let k = 0; k <= perArch; k++) {
      const a = (k / perArch) * Math.PI;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const offX = right[0] * cos * (bayWidth * 0.45);
      const offY = right[1] * cos * (bayWidth * 0.45);
      const offZ = right[2] * cos * (bayWidth * 0.45);
      const hX = up[0] * sin * archHeight;
      const hY = up[1] * sin * archHeight;
      const hZ = up[2] * sin * archHeight;
      const jx = (rng() * 2 - 1) * 0.8;
      const jy = (rng() * 2 - 1) * 0.8;
      const jz = (rng() * 2 - 1) * 0.8;
      pushPoint(
        list,
        cx + offX + hX + jx,
        cy + offY + hY + jy,
        cz + offZ + hZ + jz,
        baseScale * (0.7 + rng() * 0.6)
      );
    }
    const colH = archHeight * 0.9;
    for (let side = -1; side <= 1; side += 2) {
      const colX = cx + right[0] * side * bayWidth * 0.45;
      const colY = cy + right[1] * side * bayWidth * 0.45;
      const colZ = cz + right[2] * side * bayWidth * 0.45;
      for (let m = 0; m < perCol; m++) {
        pushPoint(
          list,
          colX + (rng() * 2 - 1) * 0.6,
          colY + up[1] * (m / Math.max(1, perCol - 1)) * colH + (rng() * 2 - 1) * 0.6,
          colZ + (rng() * 2 - 1) * 0.6,
          baseScale * (0.8 + rng() * 0.5)
        );
      }
    }
  }
}

function emitStaircaseDirect(list, origin, right, dir, up, stepsN, stepW, stepH, perStair, baseScale, rng) {
  for (let s = 0; s < stepsN; s++) {
    const cx = origin[0] + dir[0] * s * stepW;
    const cy = origin[1] + dir[1] * s * stepW;
    const cz = origin[2] + dir[2] * s * stepW;
    for (let k = 0; k < perStair; k++) {
      const off = (k / Math.max(1, perStair - 1) - 0.5) * stepW * 1.6;
      pushPoint(
        list,
        cx + right[0] * off + (rng() * 2 - 1) * 0.5,
        cy + up[1] * s * stepH + (rng() * 2 - 1) * 0.5,
        cz + right[2] * off + (rng() * 2 - 1) * 0.5,
        baseScale * (0.7 + rng() * 0.6)
      );
    }
  }
}

export function layoutAlmostReal(rng, params = {}) {
  const target = params.target ?? 20000;
  const extent = params.extent ?? 400;
  const bayWidth = params.bayWidth || extent * 0.2;
  const archHeight = params.archHeight || extent * 0.15;
  const stepW = params.stepWidth || extent * 0.03;
  const stepH = params.stepHeight || extent * 0.015;
  const baseScale = params.scale || 4;
  const bays = 8;
  const rows = 2;
  const stairSteps = 12;
  const perArch = Math.max(4, Math.round(target / (rows * bays * 2.5)));
  const perCol = Math.max(3, Math.round(target / (rows * bays * 8)));
  const perStair = Math.max(2, Math.round(target / (stairSteps * 3)));
  const main = randomUnit(rng);
  const up0 = Math.abs(main[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const up = normalize([
    up0[1] * main[2] - up0[2] * main[1],
    up0[2] * main[0] - up0[0] * main[2],
    up0[0] * main[1] - up0[1] * main[0],
  ]);
  const dir = normalize([
    main[1] * up[2] - main[2] * up[1],
    main[2] * up[0] - main[0] * up[2],
    main[0] * up[1] - main[1] * up[0],
  ]);
  const right = normalize([
    dir[1] * up[2] - dir[2] * up[1],
    dir[2] * up[0] - dir[0] * up[2],
    dir[0] * up[1] - dir[1] * up[0],
  ]);
  const list = [];
  for (let r = 0; r < rows; r++) {
    const off = (r - (rows - 1) / 2) * bayWidth * 1.4;
    const origin = [
      dir[0] * -bays * bayWidth * 0.5 + right[0] * off,
      dir[1] * -bays * bayWidth * 0.5 + right[1] * off,
      dir[2] * -bays * bayWidth * 0.5 + right[2] * off,
    ];
    emitArchRowDirect(list, origin, right, dir, up, bays, bayWidth, archHeight, perArch, perCol, baseScale, rng);
  }
  emitStaircaseDirect(list, [0, 0, 0], right, dir, up, stairSteps, stepW, stepH, perStair, baseScale, rng);
  return toArrays(list);
}

// ---------- layoutVoid: пустота, редкие точки в огромном пространстве ----------

export function layoutVoid(rng, params = {}) {
  const target = params.target ?? 20000;
  const extent = params.extent ?? 400;
  const clusters = params.clusters ?? 12;
  const baseScale = params.scale || 6;
  const per = Math.max(1, Math.round(target / clusters));
  const centers = [];
  for (let c = 0; c < clusters; c++) {
    const u = rng() * 2 - 1;
    const v = rng() * 2 - 1;
    const w = rng() * 2 - 1;
    const len = Math.hypot(u, v, w) || 1;
    const rad = extent * (0.2 + rng() * 0.75);
    const spread = extent * (0.02 + rng() * 0.05);
    centers.push([(u / len) * rad, (v / len) * rad, (w / len) * rad, spread]);
  }
  const list = [];
  for (const [cx, cy, cz, spread] of centers) {
    for (let i = 0; i < per; i++) {
      const a = rng() * Math.PI * 2;
      const b = Math.acos(rng() * 2 - 1);
      const rr = spread * Math.cbrt(rng());
      pushPoint(
        list,
        cx + rr * Math.sin(b) * Math.cos(a),
        cy + rr * Math.sin(b) * Math.sin(a),
        cz + rr * Math.cos(b),
        baseScale * (0.5 + rng() * 1.2)
      );
    }
  }
  return toArrays(list);
}
