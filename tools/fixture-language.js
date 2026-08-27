// Эталон договора о языке мира для самопроверки language-check. ЭТО НЕ ПРОДУКТ.
//
// Язык собран схематично: задача эталона не в красоте, а в честном выполнении договора,
// чтобы на нём было видно, кусается ли гейт.
//
// Порчи через globalThis.__MUTATE:
//   twins       — все сиды дают один и тот же язык
//   allforms    — язык берёт все восемь форм, то есть ничего не ограничивает
//   bigalphabet — язык берёт все пять групп глифов, письмо перестаёт быть своим
//   onevariant  — variantOf не смотрит на rng: вариаций нет, все одинаковы
//   wildvariant — вариация уезжает в чужую форму: арка перестаёт быть аркой
//   random      — Math.random вместо сеяного PRNG
import { mulberry32, strToSeed } from "../src/core/rng.js";

const M = () => globalThis.__MUTATE || "";
const TAU = Math.PI * 2;

export const FORM_KINDS = ["arch", "ring", "diamond", "branch", "slab", "spire", "tetra", "mesh"];

// Те же пять групп, что в атласе: греческие, математические, стрелки, фигуры, цифры.
export const GLYPH_GROUPS = {
  greek: [0, 49], math: [49, 32], arrow: [81, 10], shape: [91, 27], digit: [118, 10],
};
const GROUP_NAMES = Object.keys(GLYPH_GROUPS);

const MARK_KINDS = ["emblem", "string", "formula", "panel", "edge", "rosette", "lattice", "pattern", "marking"];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function pickSome(list, n, rng) {
  const pool = list.slice();
  const out = [];
  for (let k = 0; k < n && pool.length; k++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

export function buildLanguage(seedCode) {
  const mutate = M();
  const rng = mutate === "random" ? Math.random : mulberry32(strToSeed(String(seedCode) + ":lang"));
  const twins = mutate === "twins";
  const pull = twins ? () => 0.5 : rng;

  const nAlpha = mutate === "bigalphabet" ? 5 : 2 + Math.floor(pull() * 2);
  const alphabet = twins ? GROUP_NAMES.slice(0, nAlpha) : pickSome(GROUP_NAMES, nAlpha, pull);
  const glyphs = [];
  for (const a of alphabet) {
    const [start, len] = GLYPH_GROUPS[a];
    for (let i = 0; i < len; i++) glyphs.push(start + i);
  }

  const nForms = mutate === "allforms" ? 8 : 3 + Math.floor(pull() * 2);
  const forms = twins ? FORM_KINDS.slice(0, nForms) : pickSome(FORM_KINDS, nForms, pull);

  const proportion = {
    aspect: pull(), thickness: pull(), curvature: pull(), taper: pull(), spacing: pull(),
  };
  const density = 0.25 + pull() * 0.7;

  const raw = MARK_KINDS.map(() => 0.05 + pull());
  const sum = raw.reduce((s, v) => s + v, 0);
  const markWeights = {};
  MARK_KINDS.forEach((k, i) => { markWeights[k] = raw[i] / sum; });

  function variantOf(form, vrng) {
    const r = mutate === "onevariant" ? () => 0.5 : vrng;
    // Пять параметров — пять НЕЗАВИСИМЫХ чисел. Пока их брали три и переиспользовали,
    // вариации выходили связанными: размер тянул за собой кривизну, и шесть вариаций
    // давали четыре различимые. Гейт поймал это на арке.
    const a = r(), b = r(), c = r(), d = r(), e = r();
    // Вариация гуляет ВНУТРИ языка: пропорции языка сдвигаются, но не переписываются.
    const p = {
      size: 0.5 + a * 1.9,
      aspect: clamp01(proportion.aspect * 0.6 + b * 0.4),
      thickness: clamp01(proportion.thickness * 0.6 + c * 0.4),
      curvature: clamp01(proportion.curvature * 0.6 + d * 0.4),
      taper: clamp01(proportion.taper * 0.6 + e * 0.4),
    };
    // Порча: вариация уезжает в чужую форму, оставаясь при своём имени.
    const drawn = mutate === "wildvariant" ? FORM_KINDS[Math.floor(a * FORM_KINDS.length) % 8] : form;
    const count = 1400;
    return {
      form, drawn, count, ...p,
      fill(i, out) { return drawShape(drawn, i, count, p, out); },
    };
  }

  return { alphabet, glyphs, forms, proportion, density, markWeights, variantOf };
}

// ── формы ─────────────────────────────────────────────────────────────────────
// Все рисуются как ПРОВОЛОКА: точки по рёбрам и полосам, а не набивка объёма.
// Так они и выглядят на референсе — светящийся контур, а не пятно.

const R = 100;

function edgeSample(verts, edges, i, n, out, jitter) {
  const per = Math.max(1, Math.floor(n / edges.length));
  const e = Math.min(edges.length - 1, Math.floor(i / per));
  const t = ((i % per) + 0.5) / per;
  const a = verts[edges[e][0]], b = verts[edges[e][1]];
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  if (jitter) {
    const j = ((i * 2654435761) % 1000) / 1000 - 0.5;
    out[0] += j * jitter; out[2] += j * jitter;
  }
  return out;
}

function drawShape(kind, i, n, p, out) {
  const s = p.size;
  switch (kind) {
    case "arch": return arch(i, n, p, s, out);
    case "ring": return ring(i, n, p, s, out);
    case "diamond": return diamond(i, n, p, s, out);
    case "branch": return branch(i, n, p, s, out);
    case "slab": return slab(i, n, p, s, out);
    case "spire": return spire(i, n, p, s, out);
    case "tetra": return tetra(i, n, p, s, out);
    default: return mesh(i, n, p, s, out);
  }
}

// Арка: две стойки и свод. Середина по горизонтали ПУСТА — это проём.
// Вариация — не только размер: сколько вложенных обводов, насколько свод стрельчатый,
// какой высоты стойки. Ровно то, о чём человек: «даже если они имеют одну форму, то и
// размер может отличаться точно так же, как и форма».
function arch(i, n, p, s, out) {
  const half = R * s * (0.45 + p.thickness * 0.2);
  const legH = R * s * (0.35 + p.aspect * 1.1);
  const orders = 1 + Math.floor(p.thickness * 2.99);
  const point = 0.45 + p.taper * 1.3;      // 0.45 — приплюснутый свод, 1.75 — стрельчатый
  const rise = 0.6 + p.curvature * 0.9;
  const legs = Math.floor(n * 0.45);
  if (i < legs) {
    const k = i % orders;
    const side = Math.floor(i / orders) % 2 === 0 ? -1 : 1;
    const t = (Math.floor(i / (orders * 2)) + 0.5) / Math.max(1, Math.floor(legs / (orders * 2)));
    out[0] = side * half * (1 - k * 0.13);
    out[1] = t * legH; out[2] = 0;
    return out;
  }
  const j = i - legs;
  const k = j % orders;
  const t = Math.floor(j / orders) / Math.max(1, Math.floor((n - legs) / orders));
  const a = Math.PI * t;
  const hh = half * (1 - k * 0.13);
  out[0] = -Math.cos(a) * hh;
  out[1] = legH + Math.pow(Math.sin(a), 1 / point) * hh * rise;
  out[2] = 0;
  return out;
}

// Кольцо: плоский обод вокруг пустой середины. Вариация — не только размер: меняется
// число вложенных ободов и то, замкнут обод или разорван. Пока менялся один размер,
// шесть вариаций давали четыре различимые: у кольца облик держится строением обода.
function ring(i, n, p, s, out) {
  const rad = R * s * 0.55;
  const bands = 1 + Math.floor(p.aspect * 2.99);
  const arc = 0.55 + p.taper * 0.45;
  const k = i % bands;
  const t = Math.floor(i / bands) / Math.max(1, Math.floor(n / bands));
  const a = t * TAU * arc;
  const rr = rad * (1 - k * (0.1 + p.thickness * 0.18));
  out[0] = Math.cos(a) * rr;
  out[1] = (k - bands / 2) * R * s * 0.03;
  out[2] = Math.sin(a) * rr;
  return out;
}

// Ромб: октаэдр — шесть вершин, двенадцать рёбер, середина по высоте самая широкая.
function diamond(i, n, p, s, out) {
  const w = R * s * 0.5, h = R * s * (0.5 + p.aspect * 0.8);
  const v = [[0, h, 0], [0, -h, 0], [w, 0, 0], [-w, 0, 0], [0, 0, w], [0, 0, -w]];
  const e = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5],
             [2, 4], [4, 3], [3, 5], [5, 2]];
  return edgeSample(v, e, i, n, out, 0);
}

// Ветвь: дерево. Точки густо наверху — этим ветвь и отличается от шпиля.
function branch(i, n, p, s, out) {
  const segs = branchSegs(p, s);
  const per = Math.max(1, Math.floor(n / segs.length));
  const k = Math.min(segs.length - 1, Math.floor(i / per));
  const t = ((i % per) + 0.5) / per;
  const [a, b] = segs[k];
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}
const branchCache = new Map();
function branchSegs(p, s) {
  // Вариация ветви — не только размер: меняются глубина ветвления и число отростков.
  // Пока менялись одни пропорции, шесть вариаций давали три различимые: у дерева облик
  // держится СТРОЕНИЕМ, а не толщиной. Гейт поймал это на самопроверке.
  const levels = 2 + Math.floor(p.aspect * 2.99);
  const kidsBase = 2 + Math.floor(p.thickness * 2.99);
  const key = Math.round(p.curvature * 50) + ':' + levels + ':' + kidsBase + ':' + Math.round(s * 50);
  if (branchCache.has(key)) return branchCache.get(key);
  const segs = [];
  const grow = (x, y, z, len, ang, lvl) => {
    if (lvl > levels) return;
    const kids = kidsBase + (lvl % 2);
    for (let k = 0; k < kids; k++) {
      const a = ang + (k - (kids - 1) / 2) * (0.5 + p.curvature * 0.7);
      const nx = x + Math.sin(a) * len, ny = y + Math.cos(a) * len, nz = z + Math.cos(a * 1.7) * len * 0.3;
      segs.push([[x, y, z], [nx, ny, nz]]);
      grow(nx, ny, nz, len * 0.62, a, lvl + 1);
    }
  };
  const trunk = R * s * (0.3 + p.aspect * 0.4);
  segs.push([[0, 0, 0], [0, trunk, 0]]);
  grow(0, trunk, 0, trunk * 0.8, 0, 0);
  branchCache.set(key, segs);
  return segs;
}

// Плита: коробка без верха и низа — четыре стены здания, точки по всей грани.
function slab(i, n, p, s, out) {
  const w = R * s * (0.28 + p.thickness * 0.25);
  const h = R * s * (0.7 + p.aspect * 1.4);
  const face = i % 4;
  const t = ((i * 7919) % 997) / 997;
  const u = ((i * 104729) % 991) / 991;
  const x = (t - 0.5) * 2 * w, z = (t - 0.5) * 2 * w;
  if (face === 0) { out[0] = x; out[2] = w; }
  else if (face === 1) { out[0] = x; out[2] = -w; }
  else if (face === 2) { out[0] = w; out[2] = z; }
  else { out[0] = -w; out[2] = z; }
  out[1] = u * h;
  return out;
}

// Шпиль: сужающаяся к небу пирамида. Низ широкий, верх сходится в точку.
function spire(i, n, p, s, out) {
  const w = R * s * (0.22 + p.thickness * 0.2);
  const h = R * s * (1.0 + p.aspect * 1.6);
  const base = Math.floor(n * 0.25);
  if (i < base) {
    const a = (i / base) * TAU;
    out[0] = Math.cos(a) * w; out[1] = 0; out[2] = Math.sin(a) * w;
    return out;
  }
  const ribs = 6;
  const k = (i - base) % ribs;
  const t = Math.floor((i - base) / ribs) / Math.max(1, Math.floor((n - base) / ribs));
  const a = (k / ribs) * TAU;
  const taper = Math.pow(1 - t, 0.6 + p.taper * 1.2);
  out[0] = Math.cos(a) * w * taper;
  out[1] = t * h;
  out[2] = Math.sin(a) * w * taper;
  return out;
}

// Тетраэдр: широкое основание, одна вершина. Низ тяжелее — этим и отличается от ромба.
function tetra(i, n, p, s, out) {
  const w = R * s * 0.55, h = R * s * (0.6 + p.aspect * 0.9);
  const v = [[0, h, 0]];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    v.push([Math.cos(a) * w, 0, Math.sin(a) * w]);
  }
  const e = [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3], [3, 1]];
  return edgeSample(v, e, i, n, out, 0);
}

// Решётка: поле узлов. Единственная форма без высоты. Вариация — густота сетки,
// вытянутость поля и лёгкая волна. Пока сетка была всегда десять на десять, шесть
// вариаций давали три различимые; нашлось это, только когда гейт стал проверять
// вариации у ВСЕХ форм, а не у трёх из одного языка.
function mesh(i, n, p, s, out) {
  const side = 6 + Math.floor(p.thickness * 10.99);
  const w = R * s * 0.6;
  const long = 0.6 + p.aspect * 0.9;
  const x = i % side, z = Math.floor(i / side) % side;
  const u = (x + 0.5) / side - 0.5, v = (z + 0.5) / side - 0.5;
  out[0] = u * 2 * w;
  out[1] = Math.sin(u * 6.3) * R * s * 0.06 * p.curvature;
  out[2] = v * 2 * w * long;
  return out;
}
