// Эталон для самопроверки гейта surface-check. ЭТО НЕ ПРОДУКТ.
//
// Гейт, который никто не проверял, ничего не охраняет: в этом проекте уже трижды
// оказывалось, что проверка мерит не то. Поэтому у surface-check есть эталон —
// заведомо правильная реализация договора, — и набор порч. Гейт обязан пропустить
// эталон и завалить каждую порчу. Если порча проходит, гейт слеп.
//
// Порча включается через globalThis.__MUTATE до импорта:
//   volume      — точки уезжают с поверхности в объём
//   filled      — знаки заливаются вместо обводки
//   onescale    — все знаки одного размера
//   flatnormals — нормали одинаковые на любой поверхности
//   twins       — все девять родов рисуются одинаково
//   random      — Math.random вместо сеяного PRNG
import { mulberry32, strToSeed } from "../src/core/rng.js";

export const MARK_KINDS = [
  "emblem",   // крупный знак-обводка размером в этаж
  "string",   // строка мелких символов
  "formula",  // читаемая запись со знаком равенства
  "panel",    // знак в рамке, вывеска
  "edge",     // световая линия по ребру
  "rosette",  // круговой орнамент с делениями
  "lattice",  // решётка знаков, обои
  "pattern",  // крупный геометрический узор
  "marking",  // разметка: длинная дуга по полу
];

const M = () => globalThis.__MUTATE || "";

function rngFor(seed) {
  if (M() === "random") return Math.random;
  return mulberry32(strToSeed(seed));
}

const TAU = Math.PI * 2;

// Доли габарита поверхности. Иерархия масштабов — главное, из чего берётся
// ощущение наполненности: от знака в этаж до крошечных в решётке.
const SCALE = {
  emblem: 0.42,
  panel: 0.16,
  formula: 0.30,
  string: 0.11,
  edge: 0.55,
  rosette: 0.13,
  lattice: 0.02,
  pattern: 0.25,
  marking: 0.60,
};

export function buildMark(kind, rng, opts = {}) {
  if (!MARK_KINDS.includes(kind)) throw new Error("неизвестный род знака: " + kind);
  const mutate = M();
  const scale = mutate === "onescale" ? 0.2 : SCALE[kind];
  const hollow = kind === "emblem" || kind === "panel" || kind === "rosette"
    || kind === "edge" || kind === "marking";
  const filled = mutate === "filled";
  const twins = mutate === "twins";

  const count = opts.count || defaultCount(kind);
  const seeds = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) {
    seeds[i * 3] = rng();
    seeds[i * 3 + 1] = rng();
    seeds[i * 3 + 2] = rng();
  }

  function fill(i, out) {
    const a = seeds[i * 3], b = seeds[i * 3 + 1], c = seeds[i * 3 + 2];
    if (twins) { out[0] = a; out[1] = b; out[2] = Math.floor(c * 128); return out; }
    switch (kind) {
      case "emblem":   return star(i, count, a, b, c, out, filled);
      case "panel":    return roundedRect(i, count, a, b, c, out, filled);
      case "rosette":  return rosette(i, count, a, b, c, out, filled);
      case "edge":     return line(i, count, a, c, out, 0.006);
      case "marking":  return arc(i, count, a, c, out);
      case "string":   return line(i, count, a, c, out, 0.05);
      case "formula":  return formula(i, count, a, b, c, out);
      case "lattice":  return lattice(i, count, c, out);
      case "pattern":  return checker(i, count, a, b, c, out);
      default:         return line(i, count, a, c, out, 0.05);
    }
  }

  return { kind, count, scale, hollow, fill };
}

function defaultCount(kind) {
  if (kind === "lattice") return 900;
  if (kind === "string" || kind === "formula") return 90;
  if (kind === "pattern") return 400;
  return 200;
}

// ── рисунки знаков в единичном квадрате ───────────────────────────────────────
// Все возвращают out = [u, v, glyph], u и v в пределах [0, 1].

// Эмблема — звезда, а не кольцо. Первая версия рисовала концентрические окружности,
// и гейт справедливо назвал её близнецом розетки: расхождение отпечатков 0.078 при
// пороге 0.18. Разные имена при одном рисунке — ровно то, чем закрылись R25 и R26.
function star(i, n, a, b, c, out, filled) {
  if (filled) {
    const t = a * TAU, r = 0.45 * Math.sqrt(b);
    out[0] = 0.5 + Math.cos(t) * r; out[1] = 0.5 + Math.sin(t) * r;
    out[2] = Math.floor(c * 128);
    return out;
  }
  const points = 5;
  const seg = (i / n) * points * 2;
  const k = Math.floor(seg);
  const f = seg - k;
  const r0 = k % 2 === 0 ? 0.46 : 0.19;
  const r1 = k % 2 === 0 ? 0.19 : 0.46;
  const a0 = (k / (points * 2)) * TAU;
  const a1 = ((k + 1) / (points * 2)) * TAU;
  const x0 = Math.cos(a0) * r0, y0 = Math.sin(a0) * r0;
  const x1 = Math.cos(a1) * r1, y1 = Math.sin(a1) * r1;
  out[0] = 0.5 + x0 + (x1 - x0) * f;
  out[1] = 0.5 + y0 + (y1 - y0) * f;
  out[2] = Math.floor(c * 128);
  return out;
}

function circleOutline(i, n, a, b, c, out, filled, ticks) {
  const t = (i / n) * TAU;
  const r = filled ? 0.45 * Math.sqrt(a) : 0.45 - (i % ticks) * 0.02;
  out[0] = 0.5 + Math.cos(t) * r;
  out[1] = 0.5 + Math.sin(t) * r;
  out[2] = Math.floor(c * 128);
  return out;
}

function roundedRect(i, n, a, b, c, out, filled) {
  if (filled) { out[0] = 0.1 + a * 0.8; out[1] = 0.1 + b * 0.8; out[2] = Math.floor(c * 128); return out; }
  const t = (i / n) * 4;
  const s = t % 1;
  const side = Math.floor(t) % 4;
  const lo = 0.08, hi = 0.92;
  if (side === 0) { out[0] = lo + s * (hi - lo); out[1] = lo; }
  else if (side === 1) { out[0] = hi; out[1] = lo + s * (hi - lo); }
  else if (side === 2) { out[0] = hi - s * (hi - lo); out[1] = hi; }
  else { out[0] = lo; out[1] = hi - s * (hi - lo); }
  out[2] = Math.floor(c * 128);
  return out;
}

function rosette(i, n, a, b, c, out, filled) {
  const ring = i % 3;
  const r = filled ? 0.45 * Math.sqrt(a) : 0.20 + ring * 0.11;
  const t = (Math.floor(i / 3) / Math.max(1, Math.floor(n / 3))) * TAU;
  out[0] = 0.5 + Math.cos(t) * r;
  out[1] = 0.5 + Math.sin(t) * r;
  out[2] = Math.floor(c * 128);
  return out;
}

function line(i, n, a, c, out, thickness) {
  out[0] = i / Math.max(1, n - 1);
  out[1] = 0.5 + (a - 0.5) * thickness;
  out[2] = Math.floor(c * 128);
  return out;
}

function arc(i, n, a, c, out) {
  const t = i / Math.max(1, n - 1);
  out[0] = t;
  out[1] = 0.5 + Math.sin(t * Math.PI) * 0.28 + (a - 0.5) * 0.01;
  out[2] = Math.floor(c * 128);
  return out;
}

function formula(i, n, a, b, c, out) {
  // Запись: базовая строка плюс редкие верхние индексы — по ним формула отличима
  // от простой строки замером, а не на слово.
  const up = i % 7 === 0;
  out[0] = i / Math.max(1, n - 1);
  out[1] = (up ? 0.62 : 0.5) + (a - 0.5) * 0.04;
  out[2] = Math.floor(((i * 37) % 96) + 16);
  return out;
}

function lattice(i, n, c, out) {
  const side = Math.max(2, Math.round(Math.sqrt(n)));
  const x = i % side, y = Math.floor(i / side) % side;
  out[0] = (x + 0.5) / side;
  out[1] = (y + 0.5) / side;
  out[2] = Math.floor(c * 128);
  return out;
}

function checker(i, n, a, b, c, out) {
  const side = 8;
  const cell = i % (side * side);
  const cx = cell % side, cy = Math.floor(cell / side);
  if ((cx + cy) % 2 === 1) { out[0] = -1; out[1] = -1; out[2] = 0; return out; }
  out[0] = (cx + a) / side;
  out[1] = (cy + b) / side;
  out[2] = Math.floor(c * 128);
  return out;
}

// ── укладка знаков на поверхность ─────────────────────────────────────────────

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// spec:
//   { type: "plane",    origin, u, v, w, h }
//   { type: "cylinder", center, radius, height }
//   { type: "sphere",   center, radius }
function pointOn(spec, s, t) {
  if (spec.type === "plane") {
    const u = normalize(spec.u), v = normalize(spec.v);
    const p = [
      spec.origin[0] + u[0] * s * spec.w + v[0] * t * spec.h,
      spec.origin[1] + u[1] * s * spec.w + v[1] * t * spec.h,
      spec.origin[2] + u[2] * s * spec.w + v[2] * t * spec.h,
    ];
    const n = normalize([
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ]);
    return [p, n];
  }
  if (spec.type === "cylinder") {
    const a = s * TAU;
    const n = [Math.cos(a), 0, Math.sin(a)];
    const p = [
      spec.center[0] + n[0] * spec.radius,
      spec.center[1] + (t - 0.5) * spec.height,
      spec.center[2] + n[2] * spec.radius,
    ];
    return [p, n];
  }
  const a = s * TAU;
  const b = Math.acos(2 * t - 1);
  const n = [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)];
  const p = [
    spec.center[0] + n[0] * spec.radius,
    spec.center[1] + n[1] * spec.radius,
    spec.center[2] + n[2] * spec.radius,
  ];
  return [p, n];
}

export function buildSurface(seedCode, spec, opts = {}) {
  const mutate = M();
  const rng = rngFor(seedCode + ":surface");
  const kinds = opts.marks && opts.marks.length ? opts.marks : MARK_KINDS.slice();
  const marks = kinds.map((k) => buildMark(k, rng));

  let total = 0;
  for (const m of marks) total += m.count;

  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const glyph = new Float32Array(total);
  const size = new Float32Array(total);
  const kind = new Float32Array(total);
  const mark = new Float32Array(total);

  const out = [0, 0, 0];
  let w = 0;
  for (let mi = 0; mi < marks.length; mi++) {
    const m = marks[mi];
    // Куда сажаем знак на поверхности: свой угол для каждого знака.
    const s0 = rng(), t0 = rng();
    for (let i = 0; i < m.count; i++) {
      m.fill(i, out);
      if (out[0] < 0) continue;  // пропуск (у шахматного узора)
      const s = (s0 + (out[0] - 0.5) * m.scale + 1) % 1;
      const t = Math.min(0.999, Math.max(0.001, t0 + (out[1] - 0.5) * m.scale));
      const [p, n] = pointOn(spec, s, t);
      let off = 0;
      if (mutate === "volume") off = (rng() - 0.5) * (spec.radius || spec.w || 100) * 0.5;
      positions[w * 3] = p[0] + n[0] * off;
      positions[w * 3 + 1] = p[1] + n[1] * off;
      positions[w * 3 + 2] = p[2] + n[2] * off;
      if (mutate === "flatnormals") { normals[w * 3] = 0; normals[w * 3 + 1] = 1; normals[w * 3 + 2] = 0; }
      else { normals[w * 3] = n[0]; normals[w * 3 + 1] = n[1]; normals[w * 3 + 2] = n[2]; }
      glyph[w] = out[2];
      size[w] = m.scale;
      kind[w] = MARK_KINDS.indexOf(m.kind);
      mark[w] = mi;
      w++;
    }
  }

  return {
    positions: positions.subarray(0, w * 3),
    normals: normals.subarray(0, w * 3),
    glyph: glyph.subarray(0, w),
    size: size.subarray(0, w),
    kind: kind.subarray(0, w),
    mark: mark.subarray(0, w),
    count: w,
  };
}
