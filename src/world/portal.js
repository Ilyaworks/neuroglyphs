import * as THREE from "three";
import { mulberry32, strToSeed } from "../core/rng.js";
import { GLYPHS } from "../core/glyphs.js";
import { buildFieldMaterial } from "./fieldMaterial.js";

// Формы отверстия портала. Каждая — замкнутый контур в единичных координатах:
// четырёхлистник (кадр 1), круг, треугольник, звезда, ромб (кадр 8).
const EXIT_SHAPES = [
  (t) => {
    const r = 0.85 * (0.65 + 0.35 * Math.cos(4 * t));
    return [r * Math.cos(t), r * Math.sin(t)];
  },
  (t) => [0.8 * Math.cos(t), 0.8 * Math.sin(t)],
  (t) => {
    const R = 0.9;
    const a = t - Math.PI / 2;
    const step = (2 * Math.PI) / 3;
    const i = Math.floor(a / step);
    const f = (a - i * step) / step;
    const ang0 = i * step;
    const ang1 = (i + 1) * step;
    const x0v = R * Math.cos(ang0 - Math.PI / 2);
    const y0v = R * Math.sin(ang0 - Math.PI / 2);
    const x1v = R * Math.cos(ang1 - Math.PI / 2);
    const y1v = R * Math.sin(ang1 - Math.PI / 2);
    return [x0v + (x1v - x0v) * f, y0v + (y1v - y0v) * f];
  },
  (t) => {
    const R = 0.9, r = 0.42;
    const a = t - Math.PI / 2;
    const step = Math.PI / 5;
    const i = Math.floor(a / step);
    const f = (a - i * step) / step;
    const ang0 = i * step;
    const ang1 = (i + 1) * step;
    const rad0 = i % 2 === 0 ? R : r;
    const rad1 = i % 2 === 0 ? r : R;
    const x0v = rad0 * Math.cos(ang0 - Math.PI / 2);
    const y0v = rad0 * Math.sin(ang0 - Math.PI / 2);
    const x1v = rad1 * Math.cos(ang1 - Math.PI / 2);
    const y1v = rad1 * Math.sin(ang1 - Math.PI / 2);
    return [x0v + (x1v - x0v) * f, y0v + (y1v - y0v) * f];
  },
  (t) => {
    const a = t - Math.PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const m = Math.max(Math.abs(c), Math.abs(s), 1e-6);
    return [0.9 * c / m, 0.9 * s / m];
  },
];

// Контур формы в N точках, сглаженный сдвигом, чтобы глифы ложились без скачков.
function sampleShape(fn, n) {
  const raw = [];
  for (let i = 0; i < n; i++) {
    raw.push(fn((i / n) * Math.PI * 2));
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = raw[(i - 1 + n) % n];
    const p1 = raw[i];
    const p2 = raw[(i + 1) % n];
    out.push([(p0[0] + 2 * p1[0] + p2[0]) / 4, (p0[1] + 2 * p1[1] + p2[1]) / 4]);
  }
  return out;
}

// Прямоугольная рамка: четыре полосы глифов. Точки лежат на периметре,
// шаг выбирается так, чтобы полоса была сплошной.
function rectPerimeter(halfW, halfH, step, rng) {
  const pts = [];
  const per = 2 * (halfW + halfH);
  const n = Math.max(16, Math.floor(per / step));
  for (let i = 0; i < n; i++) {
    let d = (i / n) * per;
    let x, y;
    if (d < halfW * 2) {
      x = -halfW + d; y = halfH;
    } else if (d < halfW * 2 + halfH * 2) {
      d -= halfW * 2; x = halfW; y = halfH - d;
    } else if (d < halfW * 3 + halfH * 2) {
      d -= halfW * 2 + halfH * 2; x = halfW - d; y = -halfH;
    } else {
      d -= halfW * 3 + halfH * 2; x = -halfW; y = -halfH + d;
    }
    // лёгкий разброс в глубину, чтобы полоса имела объём
    pts.push([x, y, (rng() - 0.5) * 6]);
  }
  return pts;
}

// Четыре слота комбо, все выведены из seed.exit:
// цвет — по битам 0-2, объект — 3-5, звук — 6-7, формула — из потока сида.
function makeCombo(exit, rng) {
  const color = new THREE.Color().setHSL(((exit & 7) / 8 + rng() * 0.05) % 1, 1, 0.55);
  const object = (exit >> 3) & 7;
  const sound = (exit >> 6) & 3;
  const formula = Math.floor(rng() * GLYPHS.length);
  return { color, object, sound, formula };
}

export function buildExitPortal(seed, atlas) {
  // seed — поля сида (decodeSeed) или готовый код. Нормализуем в код,
  // чтобы отдельный поток генерации не зависел от расхода общего rng.
  const code = typeof seed === "string" ? seed : null;
  const exit = typeof seed === "object" && seed !== null ? seed.exit : 0;

  // СВОЙ поток от сида: портал генерируется после раскладки, и остаток общего
  // rng зависит от структуры мира. Свой поток — детерминизм независимо от неё.
  const rng = mulberry32(strToSeed((code || "portal") + ":portal"));

  const group = new THREE.Group();
  group.name = "exit-portal";

  // Габарит портала: прямоугольник, выход всегда прямоугольный и есть в каждом мире.
  const halfW = 30;
  const halfH = 18;
  const step = 3.2;
  const barDepth = 6;

  // Рамка: четыре полосы глифов.
  const barPts = rectPerimeter(halfW, halfH, step, rng);
  const barCount = barPts.length;
  const barPos = new Float32Array(barCount * 3);
  const barGlyph = new Float32Array(barCount);
  const barSize = new Float32Array(barCount);
  const barOff = new Float32Array(barCount);
  for (let i = 0; i < barCount; i++) {
    barPos[i * 3] = barPts[i][0];
    barPos[i * 3 + 1] = barPts[i][1];
    barPos[i * 3 + 2] = barPts[i][2];
    barGlyph[i] = Math.floor(rng() * 128);
    barSize[i] = 10 + rng() * 14;
    barOff[i] = rng();
  }
  const barGeo = new THREE.BufferGeometry();
  barGeo.setAttribute("position", new THREE.BufferAttribute(barPos, 3));
  barGeo.setAttribute("glyph", new THREE.BufferAttribute(barGlyph, 1));
  barGeo.setAttribute("size", new THREE.BufferAttribute(barSize, 1));
  barGeo.setAttribute("offset", new THREE.BufferAttribute(barOff, 1));
  barGeo.computeBoundingSphere();
  const { material: barMat, uniforms: barUniforms } = buildFieldMaterial(atlas, { fogDensity: 0.0004 });
  const bars = new THREE.Points(barGeo, barMat);
  bars.frustumCulled = false;
  group.add(bars);

  // Фигурное отверстие в центре: контур из глифов, форма по seed.exit.
  const shapeIdx = exit % EXIT_SHAPES.length;
  const shape = sampleShape(EXIT_SHAPES[shapeIdx], 96);
  const shapeScale = Math.min(halfW, halfH) * 0.7;
  const holeCount = shape.length;
  const holePos = new Float32Array(holeCount * 3);
  const holeGlyph = new Float32Array(holeCount);
  const holeSize = new Float32Array(holeCount);
  const holeOff = new Float32Array(holeCount);
  for (let i = 0; i < holeCount; i++) {
    holePos[i * 3] = shape[i][0] * shapeScale;
    holePos[i * 3 + 1] = shape[i][1] * shapeScale;
    holePos[i * 3 + 2] = (rng() - 0.5) * barDepth;
    holeGlyph[i] = Math.floor(rng() * 128);
    holeSize[i] = 8 + rng() * 10;
    holeOff[i] = rng();
  }
  const holeGeo = new THREE.BufferGeometry();
  holeGeo.setAttribute("position", new THREE.BufferAttribute(holePos, 3));
  holeGeo.setAttribute("glyph", new THREE.BufferAttribute(holeGlyph, 1));
  holeGeo.setAttribute("size", new THREE.BufferAttribute(holeSize, 1));
  holeGeo.setAttribute("offset", new THREE.BufferAttribute(holeOff, 1));
  holeGeo.computeBoundingSphere();
  const { material: holeMat } = buildFieldMaterial(atlas, { fogDensity: 0.0004 });
  const hole = new THREE.Points(holeGeo, holeMat);
  hole.frustumCulled = false;
  group.add(hole);

  // Четыре слота комбо: цвет, объект, звук, формула.
  const combo = makeCombo(exit, rng);
  const slots = [
    { kind: "color", value: combo.color, glyph: Math.floor(rng() * 128) },
    { kind: "object", value: combo.object, glyph: Math.floor(rng() * 128) },
    { kind: "sound", value: combo.sound, glyph: Math.floor(rng() * 128) },
    { kind: "formula", value: combo.formula, glyph: combo.formula },
  ];

  // isSolved: сравнение принесённого с комбо. filled — массив из четырёх значений
  // в порядке слотов (color, object, sound, formula).
  function isSolved(filled) {
    if (!Array.isArray(filled) || filled.length !== 4) return false;
    const c = filled[0];
    const colorOk = c instanceof THREE.Color
      ? Math.abs(c.r - combo.color.r) < 0.01 && Math.abs(c.g - combo.color.g) < 0.01 && Math.abs(c.b - combo.color.b) < 0.01
      : c === combo.color;
    return colorOk && filled[1] === combo.object && filled[2] === combo.sound && filled[3] === combo.formula;
  }

  // Позиция портала: за дальним краем мира, по оси Z.
  const position = new THREE.Vector3(0, 0, 120);

  group.userData = { seed: code, exit, shapeIdx, combo, slots, barUniforms };
  group.position.copy(position);

  return { group, combo, slots, isSolved, position };
}
