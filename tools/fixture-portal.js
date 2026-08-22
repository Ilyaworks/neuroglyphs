// Эталон для tools/portal-check.mjs: минимальный, но правильный портал выхода.
// Инструмент, который не проходит ни на чём, ничего не проверяет — поэтому гейт обязан
// быть зелёным на этом файле и красным на сломанном. Здесь нет ни рамки красивой, ни
// подсветки: только контракт, который стережёт гейт.
import * as THREE from "three";
import { mulberry32, strToSeed } from "../src/core/rng.js";
import { decodeSeed } from "../src/core/seed.js";

const SHAPES = [
  (t) => { const r = 0.85 * (0.65 + 0.35 * Math.cos(4 * t)); return [r * Math.cos(t), r * Math.sin(t)]; },
  (t) => [0.8 * Math.cos(t), 0.8 * Math.sin(t)],
  (t) => { const a = t - Math.PI / 2, s = (2 * Math.PI) / 3, i = Math.floor(a / s), f = (a - i * s) / s;
    const v = (k) => [0.9 * Math.cos(k * s - Math.PI / 2), 0.9 * Math.sin(k * s - Math.PI / 2)];
    const p0 = v(i), p1 = v(i + 1); return [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f]; },
  (t) => { const a = t - Math.PI / 2, s = Math.PI / 5, i = Math.floor(a / s), f = (a - i * s) / s;
    const rad = (k) => (((k % 2) + 2) % 2 === 0 ? 0.9 : 0.42);
    const v = (k) => [rad(k) * Math.cos(k * s - Math.PI / 2), rad(k) * Math.sin(k * s - Math.PI / 2)];
    const p0 = v(i), p1 = v(i + 1); return [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f]; },
  (t) => { const a = t - Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    const m = Math.max(Math.abs(c), Math.abs(s), 1e-6); return [0.9 * c / m, 0.9 * s / m]; },
];

// Сид приходит либо кодом, либо полями decodeSeed. Оба вида обязаны дать один портал,
// поэтому и exit, и поток случайности выводятся из одного нормализованного значения.
function normalize(seed) {
  if (typeof seed === "string") {
    const f = decodeSeed(seed);
    return f ? f.exit : 0;
  }
  return seed && typeof seed === "object" && Number.isFinite(seed.exit) ? seed.exit : 0;
}

function cloud(pts, rng, THREE_) {
  const n = pts.length;
  const pos = new Float32Array(n * 3), glyph = new Float32Array(n);
  const size = new Float32Array(n), off = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = pts[i][0]; pos[i * 3 + 1] = pts[i][1]; pos[i * 3 + 2] = pts[i][2] || 0;
    glyph[i] = Math.floor(rng() * 128); size[i] = 10 + rng() * 14; off[i] = rng();
  }
  const g = new THREE_.BufferGeometry();
  g.setAttribute("position", new THREE_.BufferAttribute(pos, 3));
  g.setAttribute("glyph", new THREE_.BufferAttribute(glyph, 1));
  g.setAttribute("size", new THREE_.BufferAttribute(size, 1));
  g.setAttribute("offset", new THREE_.BufferAttribute(off, 1));
  g.computeBoundingSphere();
  return g;
}

export function buildExitPortal(seed, atlas) {
  const exit = normalize(seed);
  const rng = mulberry32(strToSeed(exit + ":portal"));
  const halfW = 30, halfH = 18, step = 3.2;

  // Обход всего периметра: четыре стороны, а не две. Периметр прямоугольника
  // со сторонами 2*halfW и 2*halfH равен 4*(halfW+halfH).
  const per = 4 * (halfW + halfH);
  const n = Math.max(32, Math.floor(per / step));
  const bar = [];
  for (let i = 0; i < n; i++) {
    let d = (i / n) * per;
    if (d < 2 * halfW) bar.push([-halfW + d, halfH, (rng() - 0.5) * 6]);
    else if ((d -= 2 * halfW) < 2 * halfH) bar.push([halfW, halfH - d, (rng() - 0.5) * 6]);
    else if ((d -= 2 * halfH) < 2 * halfW) bar.push([halfW - d, -halfH, (rng() - 0.5) * 6]);
    else bar.push([-halfW, -halfH + (d - 2 * halfW), (rng() - 0.5) * 6]);
  }

  const shapeIdx = exit % SHAPES.length;
  const scale = Math.min(halfW, halfH) * 0.7;
  const hole = [];
  for (let i = 0; i < 96; i++) {
    const p = SHAPES[shapeIdx]((i / 96) * Math.PI * 2);
    hole.push([p[0] * scale, p[1] * scale, (rng() - 0.5) * 6]);
  }

  const group = new THREE.Group();
  const { material, uniforms } = { material: null, uniforms: null };
  void material; void uniforms;
  const barPoints = new THREE.Points(cloud(bar, rng, THREE), null);
  const holePoints = new THREE.Points(cloud(hole, rng, THREE), null);
  group.add(barPoints);
  group.add(holePoints);
  void atlas;

  const combo = {
    color: new THREE.Color().setHSL(((exit & 7) / 8 + rng() * 0.05) % 1, 1, 0.55),
    object: (exit >> 3) & 7,
    sound: (exit >> 6) & 3,
    formula: Math.floor(rng() * 128),
  };
  const slots = [
    { kind: "color", value: combo.color },
    { kind: "object", value: combo.object },
    { kind: "sound", value: combo.sound },
    { kind: "formula", value: combo.formula },
  ];
  function isSolved(filled) {
    if (!Array.isArray(filled) || filled.length !== 4) return false;
    const c = filled[0];
    const colorOk = c && typeof c === "object"
      ? Math.abs(c.r - combo.color.r) < 0.01 && Math.abs(c.g - combo.color.g) < 0.01 &&
        Math.abs(c.b - combo.color.b) < 0.01
      : c === combo.color;
    return colorOk && filled[1] === combo.object && filled[2] === combo.sound &&
      filled[3] === combo.formula;
  }
  const position = new THREE.Vector3(0, 0, 0);
  group.userData = { exit, shapeIdx, combo };
  return { group, combo, slots, isSolved, position };
}
