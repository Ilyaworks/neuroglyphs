// Укладка знаков НА поверхность.
//
// Это не то же, что shapeField.js: тот набивает точками объём формы, здесь точки живут
// тонким слоем на границе. Отсюда и берётся разница между «облаком в форме города» и
// городом: у постройки есть стена, а на стене — эмблема, вывеска, строки и обои.
//
// Модуль НЕ импортирует three: наружу выходят обычные массивы чисел. Сцена собирается
// из них уже в surfaceField.js, а проверять раскладку можно без браузера.
//
// Договор:
//   buildSurface(seedCode, spec, opts) -> { positions, normals, glyph, size, dot,
//                                           kind, mark, count }
//   spec — { type:"plane", origin,u,v,w,h } | { type:"cylinder", center,radius,height }
//        | { type:"sphere", center,radius }
//   opts.marks — какие роды класть на эту поверхность (по умолчанию все)
import { mulberry32, strToSeed } from "../core/rng.js";
import { MARK_KINDS, buildMark } from "./marks.js";

const TAU = Math.PI * 2;

// Сколько знаков какого рода ложится на одну поверхность. Эмблема одна на стену,
// вывесок несколько, строк десяток, а решётка идёт плиткой сплошняком — из этого
// и складывается «пространство, заполненное деталями».
const HOW_MANY = {
  emblem:  [1, 2],
  pattern: [1, 1],
  marking: [1, 2],
  edge:    [0, 0],   // рёбра ставятся отдельно, по краям поверхности
  formula: [1, 3],
  panel:   [3, 6],
  rosette: [2, 4],
  string:  [8, 18],
  lattice: [0, 0],   // решётка идёт плиткой, число считается по площади
};

// Размер одного глифа как доля габарита самого знака. Знак — это рисунок ЛИНИЕЙ,
// поэтому глифы стоят вплотную: иначе обводка читается цепочкой значков, а не линией.
const DOT = {
  emblem: 0.030, panel: 0.035, rosette: 0.030, edge: 0.010, marking: 0.020,
  string: 0.030, formula: 0.070, lattice: 0.22, pattern: 0.055,
};
// Потолок размера глифа: без него крупный узор на большой стене раздувается
// в светящиеся кляксы шириной с окно.
const DOT_MIN = 1.5, DOT_MAX = 18;

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function surfaceExtent(spec) {
  if (spec.type === "plane") return Math.max(spec.w, spec.h);
  if (spec.type === "cylinder") return Math.max(spec.radius * 2, spec.height);
  return spec.radius * 2;
}

// Сколько мировой длины приходится на единицу параметра. Без этого знак на широкой
// низкой стене растягивается в блин, а на кольце туннеля — сплющивается.
function paramScale(spec, t) {
  if (spec.type === "plane") return [spec.w, spec.h];
  if (spec.type === "cylinder") return [TAU * spec.radius, spec.height];
  // У сферы шаг по долготе сходится к нулю у полюсов: поправка по широте.
  const polar = Math.acos(Math.min(1, Math.max(-1, 2 * t - 1)));
  return [TAU * spec.radius * Math.max(0.25, Math.sin(polar)), Math.PI * spec.radius];
}

function pointOn(spec, s, t, out) {
  if (spec.type === "plane") {
    const u = normalize(spec.u), v = normalize(spec.v);
    out.p[0] = spec.origin[0] + u[0] * s * spec.w + v[0] * t * spec.h;
    out.p[1] = spec.origin[1] + u[1] * s * spec.w + v[1] * t * spec.h;
    out.p[2] = spec.origin[2] + u[2] * s * spec.w + v[2] * t * spec.h;
    const n = normalize(cross(u, v));
    out.n[0] = n[0]; out.n[1] = n[1]; out.n[2] = n[2];
    return out;
  }
  if (spec.type === "cylinder") {
    const a = s * TAU;
    out.n[0] = Math.cos(a); out.n[1] = 0; out.n[2] = Math.sin(a);
    out.p[0] = spec.center[0] + out.n[0] * spec.radius;
    out.p[1] = spec.center[1] + (t - 0.5) * spec.height;
    out.p[2] = spec.center[2] + out.n[2] * spec.radius;
    return out;
  }
  const a = s * TAU;
  const b = Math.acos(Math.min(1, Math.max(-1, 2 * t - 1)));
  out.n[0] = Math.sin(b) * Math.cos(a);
  out.n[1] = Math.cos(b);
  out.n[2] = Math.sin(b) * Math.sin(a);
  out.p[0] = spec.center[0] + out.n[0] * spec.radius;
  out.p[1] = spec.center[1] + out.n[1] * spec.radius;
  out.p[2] = spec.center[2] + out.n[2] * spec.radius;
  return out;
}

const wrap01 = (v) => ((v % 1) + 1) % 1;

// ── план поверхности ──────────────────────────────────────────────────────────
// Что и куда кладём. Сначала список замыслов, потом одна общая укладка — так видно,
// что композиция решается сидом, а не порядком строк в коде.

function planSurface(spec, rng, allow, extent, language, opts = {}) {
  const plan = [];
  const has = (k) => allow.includes(k);
  const between = (a, b) => a + Math.floor(rng() * (b - a + 1));

  // Рёбра: обводка краёв поверхности. По ней читается сама форма постройки.
  if (has("edge")) {
    if (spec.type === "plane") {
      for (const t of [0.015, 0.985]) plan.push({ kind: "edge", s0: 0.5, t0: t, angle: 0, span: spec.w });
      for (const s of [0.015, 0.985]) plan.push({ kind: "edge", s0: s, t0: 0.5, angle: Math.PI / 2, span: spec.h });
    } else if (spec.type === "cylinder") {
      for (const t of [0.02, 0.98]) plan.push({ kind: "edge", s0: 0.5, t0: t, angle: 0, span: TAU * spec.radius, wrapU: true });
    } else {
      plan.push({ kind: "edge", s0: 0.5, t0: 0.5, angle: 0, span: TAU * spec.radius, wrapU: true });
      plan.push({ kind: "edge", s0: 0.5, t0: 0.28, angle: 0, span: TAU * spec.radius * 0.85, wrapU: true });
    }
  }

  // Решётка: плитка обоев по всей поверхности. Плитку кладём сеткой, а не наугад —
  // рассыпанные наугад плитки читаются грязью, а не покрытием.
  if (has("lattice")) {
    // Плитка обоев. opts.tile задаёт её крупность долей габарита: у стены города плитка
    // крупная, у сферы в зале мелкая.
    const want = (opts.tile || (0.018 + rng() * 0.016)) * extent;
    const [su, sv] = paramScale(spec, 0.5);
    const ns = Math.max(2, Math.min(24, Math.round(su / want)));
    const nt = Math.max(2, Math.min(24, Math.round(sv / want)));
    // Размер плитки берётся ИЗ СЕТКИ, а не наоборот. Пока плитка была задана заранее,
    // а число плиток упиралось в потолок, на широкой стене они покрывали треть площади
    // и стена просвечивала насквозь: между плитками зияли дыры шириной с них самих.
    const tile = Math.max(su / ns, sv / nt);
    for (let i = 0; i < ns; i++) {
      for (let j = 0; j < nt; j++) {
        plan.push({
          kind: "lattice", angle: 0, scale: tile / extent,
          s0: (i + 0.5) / ns, t0: (j + 0.5) / nt,
          wrapU: spec.type !== "plane",
        });
      }
    }
  }

  for (const kind of MARK_KINDS) {
    if (kind === "edge" || kind === "lattice" || !has(kind)) continue;
    const [lo, hi] = HOW_MANY[kind];
    const n = between(lo, hi);
    for (let i = 0; i < n; i++) {
      // Крупные знаки садятся ближе к середине поверхности, мелкие — где угодно.
      const big = kind === "emblem" || kind === "pattern";
      const margin = big ? 0.28 : 0.1;
      let angle = 0;
      if (kind === "string" || kind === "formula") {
        // Строки идут вдоль поверхности: вдоль стены, вдоль кольца, редко стоймя.
        angle = rng() < 0.22 ? Math.PI / 2 : 0;
      } else if (kind === "marking") {
        angle = spec.type === "plane" ? (rng() < 0.5 ? 0 : Math.PI / 2) : 0;
      }
      plan.push({
        kind, angle,
        s0: margin + rng() * (1 - margin * 2),
        t0: margin + rng() * (1 - margin * 2),
        wrapU: spec.type !== "plane",
      });
    }
  }
  return plan;
}

// ── укладка ───────────────────────────────────────────────────────────────────

export function buildSurface(seedCode, spec, opts = {}) {
  const rng = mulberry32(strToSeed(String(seedCode) + ":" + spec.type + ":" + (opts.salt || "")));
  const allow = opts.marks && opts.marks.length
    ? MARK_KINDS.filter((k) => opts.marks.includes(k))
    : MARK_KINDS.slice();
  if (!allow.length) throw new Error("на поверхность нечего класть: пустой список родов");

  const extent = surfaceExtent(spec);
  // Язык мира: его алфавитом пишутся все знаки, его веса решают, каких знаков на
  // поверхности больше. Без этого каждая стена тянет случайную смесь из девяти родов,
  // и мир читается кучей малой, а не постройкой в одной манере.
  const language = opts.language || null;
  const plan = planSurface(spec, rng, allow, extent, language, opts);

  // Знаки строятся заранее: так сид тратится одним потоком и раскладка повторяема.
  const built = plan.map((slot) => ({
    slot,
    m: buildMark(slot.kind, rng, {
      glyphs: language ? language.glyphs : undefined,
      ...(slot.scale !== undefined ? { scale: slot.scale } : {}),
    }),
  }));

  let total = 0;
  for (const b of built) total += b.m.count;

  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const glyph = new Float32Array(total);
  const size = new Float32Array(total);
  const dot = new Float32Array(total);
  const kind = new Float32Array(total);
  const mark = new Float32Array(total);

  const out = [0, 0, 0];
  const hit = { p: [0, 0, 0], n: [0, 0, 0] };
  let w = 0;

  for (let mi = 0; mi < built.length; mi++) {
    const { slot, m } = built[mi];
    // Мировой размер знака. Ребро тянется во весь край, остальные — по своей доле.
    const world = slot.span !== undefined ? slot.span : m.scale * extent;
    const [su, sv] = paramScale(spec, slot.t0);
    const ca = Math.cos(slot.angle), sa = Math.sin(slot.angle);
    const glyphWorld = Math.min(DOT_MAX, Math.max(DOT_MIN, world * (DOT[m.kind] || 0.03)));
    const ki = MARK_KINDS.indexOf(m.kind);

    for (let i = 0; i < m.count; i++) {
      m.fill(i, out);
      if (out[0] < 0) continue;
      // Знак квадратный В МИРЕ, а не в параметрах: иначе на широкой низкой стене
      // эмблема расплывается блином, а на кольце туннеля сплющивается.
      const x = (out[0] - 0.5) * world;
      const y = (out[1] - 0.5) * world;
      const rx = x * ca - y * sa;
      const ry = x * sa + y * ca;
      let s = slot.s0 + rx / su;
      let t = slot.t0 + ry / sv;
      s = slot.wrapU || spec.type !== "plane" ? wrap01(s) : Math.min(1, Math.max(0, s));
      t = Math.min(0.999, Math.max(0.001, t));
      pointOn(spec, s, t, hit);
      positions[w * 3] = hit.p[0];
      positions[w * 3 + 1] = hit.p[1];
      positions[w * 3 + 2] = hit.p[2];
      normals[w * 3] = hit.n[0];
      normals[w * 3 + 1] = hit.n[1];
      normals[w * 3 + 2] = hit.n[2];
      glyph[w] = out[2];
      size[w] = world / extent;
      dot[w] = glyphWorld;
      kind[w] = ki;
      mark[w] = mi;
      w++;
    }
  }

  return {
    positions: positions.subarray(0, w * 3),
    normals: normals.subarray(0, w * 3),
    glyph: glyph.subarray(0, w),
    size: size.subarray(0, w),
    dot: dot.subarray(0, w),
    kind: kind.subarray(0, w),
    mark: mark.subarray(0, w),
    count: w,
  };
}
