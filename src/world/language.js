// Язык мира: стилистика, которой подчиняется весь город.
//
// Кадр референса — не отдельная локация, а кусочек одного города, целиком построенного
// на одном языке. Слова человека 27.08.2026: «строится небольшой город согласно сиду,
// который имеет свою стилистику»; «каждый из элементов стиля должен иметь свои вариации»;
// «даже если они имеют одну форму, то и размер может отличаться точно так же, как и форма».
//
// Язык — это ОГРАНИЧЕНИЕ. Он берёт две-три группы глифов из пяти и три-четыре формы из
// восьми. Язык, берущий всё, — не язык: миры на нём выйдут одинаковой кашей, и ровно так
// сейчас и выглядит мир, где каждая поверхность тянет случайную смесь.
//
// Модуль НЕ импортирует three: наружу выходят числа. Сцена собирается из них снаружи.
import { mulberry32, strToSeed } from "../core/rng.js";

const TAU = Math.PI * 2;

// Восемь базовых форм города. Плоской решётки среди них нет намеренно: сетку глифов
// рисует marks.js прямо на поверхностях, а отдельным висящим полем она в референсе не
// встречается ни разу — зато купол над залом есть, и не один.
export const FORM_KINDS = ["arch", "ring", "diamond", "branch", "slab", "spire", "tetra", "dome"];

// Те же пять групп, что в атласе глифов.
export const GLYPH_GROUPS = {
  greek: [0, 49], math: [49, 32], arrow: [81, 10], shape: [91, 27], digit: [118, 10],
};

const MARK_KINDS = ["emblem", "string", "formula", "panel", "edge", "rosette", "lattice", "pattern", "marking"];

// Манера — крупный выбор, от которого пляшет всё остальное: чем город написан и чем
// он строится. Без неё язык вышел бы россыпью независимых чисел, а нужно, чтобы формы
// в одном мире выглядели роднёй.
const MANNERS = {
  // монументальная: плиты, шпили, крупные знаки-обводки на стенах
  monumental: {
    forms: ["slab", "spire", "arch", "tetra"],
    groups: ["greek", "shape", "math"],
    marks: { emblem: 3, panel: 3, edge: 3, string: 1, formula: 1, rosette: 1, lattice: 1, pattern: 2, marking: 2 },
  },
  // писаная: всё покрыто строками и формулами, форм немного и они спокойные
  written: {
    forms: ["slab", "arch", "dome", "ring"],
    groups: ["greek", "math", "digit"],
    marks: { string: 4, formula: 4, lattice: 3, panel: 1, emblem: 1, edge: 2, rosette: 1, pattern: 1, marking: 1 },
  },
  // растущая: ветви, кольца, розетки — город как заросль
  organic: {
    forms: ["branch", "ring", "dome", "diamond"],
    groups: ["greek", "arrow", "shape"],
    marks: { rosette: 4, marking: 2, string: 2, lattice: 2, edge: 2, emblem: 2, pattern: 1, panel: 1, formula: 1 },
  },
  // гранёная: ромбы, тетраэдры, шпили — всё из плоскостей и рёбер
  crystal: {
    forms: ["diamond", "tetra", "spire", "dome"],
    groups: ["shape", "math", "digit"],
    marks: { edge: 4, pattern: 3, emblem: 2, lattice: 2, rosette: 1, panel: 1, string: 1, formula: 1, marking: 1 },
  },
  // машинная: решётки, кольца, плиты, разметка под ногами
  industrial: {
    forms: ["dome", "ring", "slab", "arch"],
    groups: ["digit", "arrow", "math"],
    marks: { lattice: 4, marking: 3, pattern: 3, edge: 2, panel: 2, string: 2, formula: 1, emblem: 1, rosette: 1 },
  },
};
const MANNER_NAMES = Object.keys(MANNERS);
const GROUP_NAMES = Object.keys(GLYPH_GROUPS);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Размеры идут СТУПЕНЯМИ, а не непрерывно. Две причины, и обе важнее удобства.
// Глазу: город, где элементы повторяются в нескольких размерах, читается построенным,
// а размазанный по непрерывной шкале — шумом. Замеру: при непрерывном размере две
// вариации из шести регулярно попадали в пять процентов друг от друга и считались
// одной; ступени разводят их наверняка.
// Соседние ступени отличаются в 1.85 раза — решительно, не на глазок. При мелком шаге
// шесть вариаций регулярно попадали в две соседние ступени, и разброс размеров падал
// ниже порога: разница в полтора раза глазом за разные размеры не читается.
const SIZE_STEPS = [0.45, 0.83, 1.54, 2.85];

// Ступени и для пропорций: постройка бывает низкой, средней или высокой, свод —
// приплюснутым, полукруглым или стрельчатым. Промежуточные доли глазом не читаются,
// а замер считает их одной и той же вариацией.
const step = (v, n) => Math.min(n - 1, Math.floor(clamp01(v) * n)) / (n - 1);

// Выбор без повторов: сначала из предпочтений манеры, потом добор из общего списка.
function choose(prefer, all, n, rng) {
  const out = [];
  const pool = prefer.filter((v) => all.includes(v));
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const rest = all.filter((v) => !out.includes(v));
  while (out.length < n && rest.length) out.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  return out;
}

export function buildLanguage(seedCode) {
  const rng = mulberry32(strToSeed(String(seedCode) + ":language"));
  const manner = MANNER_NAMES[Math.floor(rng() * MANNER_NAMES.length)];
  const M = MANNERS[manner];

  // Манера ЗАДАЁТ склонность, но не диктует: четверть решений уходит за её пределы,
  // иначе миры соберутся в пять кучек и перестанут быть разными.
  const nAlpha = 2 + (rng() < 0.45 ? 1 : 0);
  const alphabet = choose(rng() < 0.75 ? M.groups : GROUP_NAMES, GROUP_NAMES, nAlpha, rng);
  const glyphs = [];
  for (const a of alphabet) {
    const [start, len] = GLYPH_GROUPS[a];
    for (let i = 0; i < len; i++) glyphs.push(start + i);
  }

  const nForms = 3 + (rng() < 0.5 ? 1 : 0);
  const forms = choose(rng() < 0.7 ? M.forms : FORM_KINDS, FORM_KINDS, nForms, rng);

  const proportion = {
    aspect: rng(), thickness: rng(), curvature: rng(), taper: rng(), spacing: rng(),
  };
  const density = 0.25 + rng() * 0.7;

  // Веса знаков: склонность манеры, приправленная сидом. Сумма ровно единица —
  // так их можно брать как доли при раскладке по поверхности.
  const raw = MARK_KINDS.map((k) => (M.marks[k] || 1) * (0.55 + rng() * 0.9));
  const sum = raw.reduce((s, v) => s + v, 0);
  const markWeights = {};
  MARK_KINDS.forEach((k, i) => { markWeights[k] = raw[i] / sum; });

  // ── вариация формы ──────────────────────────────────────────────────────────
  // Пять параметров — пять НЕЗАВИСИМЫХ чисел. Если брать три и переиспользовать,
  // размер потянет за собой кривизну, и шесть вариаций дадут четыре различимые.
  function variantOf(form, vrng) {
    const r = typeof vrng === "function" ? vrng : rng;
    const a = r(), b = r(), c = r(), d = r(), e = r(), f = r(), g = r();
    const p = {
      size: SIZE_STEPS[Math.min(SIZE_STEPS.length - 1, Math.floor(a * SIZE_STEPS.length))],
      // Язык СКЛОНЯЕТ, но не запирает: чуть больше половины хода остаётся свободным.
      // При доле языка в две трети все вариации сбивались в узкую полосу вокруг его
      // собственных чисел, и шесть вариаций давали четыре различимые.
      aspect: clamp01(proportion.aspect * 0.45 + b * 0.55),
      thickness: clamp01(proportion.thickness * 0.45 + c * 0.55),
      curvature: clamp01(proportion.curvature * 0.45 + d * 0.55),
      taper: clamp01(proportion.taper * 0.45 + e * 0.55),
      // Строение — отдельное число, и оно почти свободно. Когда приём выбирался по
      // кривизне, язык с высокой кривизной давал ВСЕ вариации одного строения: шесть
      // колец выходили одинаково разорванными. Язык склоняет выбор, но не запирает его.
      trait: clamp01(proportion.curvature * 0.3 + f * 0.7),
      // Второе число строения. Одного не хватает: когда наклон кольца брался из
      // вытянутости, склонённой языком, в мире с высокой вытянутостью все кольца
      // выходили под одним наклоном, и шесть вариаций давали четыре различимые.
      trait2: clamp01(proportion.spacing * 0.3 + g * 0.7),
    };
    const count = Math.round(700 + density * 1600);
    return {
      form, count, ...p,
      fill(i, out) { return drawForm(form, i, count, p, out); },
    };
  }

  return { manner, alphabet, glyphs, forms, proportion, density, markWeights, variantOf };
}

// ── формы ─────────────────────────────────────────────────────────────────────
// Всё рисуется ПРОВОЛОКОЙ: точки по рёбрам, ободам и граням, а не набивка объёма.
// На референсе постройки читаются светящимся контуром, а не пятном.

const R = 100;

function edgeSample(verts, edges, i, n, out) {
  const per = Math.max(1, Math.floor(n / edges.length));
  const e = Math.min(edges.length - 1, Math.floor(i / per));
  const t = ((i % per) + 0.5) / per;
  const a = verts[edges[e][0]], b = verts[edges[e][1]];
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

function drawForm(kind, i, n, p, out) {
  switch (kind) {
    case "arch": return arch(i, n, p, out);
    case "ring": return ring(i, n, p, out);
    case "diamond": return diamond(i, n, p, out);
    case "branch": return branch(i, n, p, out);
    case "slab": return slab(i, n, p, out);
    case "spire": return spire(i, n, p, out);
    case "tetra": return tetra(i, n, p, out);
    default: return dome(i, n, p, out);
  }
}

// Арка: стойки и свод, середина ПУСТА — это проём. Меняются число вложенных обводов,
// стрельчатость свода, высота стоек и наличие замкового камня.
function arch(i, n, p, out) {
  const s = p.size;
  const half = R * s * (0.45 + p.thickness * 0.2);
  const legH = R * s * (0.35 + step(p.aspect, 3) * 1.1);
  // Число вложенных обводов берётся из свободного числа строения, а не из толщины:
  // толщина склонена языком, и в мире с толстыми формами все арки выходили одинаковыми.
  const orders = 1 + Math.floor(p.trait * 2.99);
  const point = 0.45 + step(p.taper, 3) * 1.3;
  const rise = 0.6 + p.curvature * 0.9;
  const legs = Math.floor(n * 0.45);
  if (i < legs) {
    const k = i % orders;
    const side = Math.floor(i / orders) % 2 === 0 ? -1 : 1;
    const t = (Math.floor(i / (orders * 2)) + 0.5) / Math.max(1, Math.floor(legs / (orders * 2)));
    out[0] = side * half * (1 - k * 0.13);
    out[1] = t * legH;
    out[2] = 0;
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

// Кольцо: обод вокруг пустой середины. Меняются число вложенных ободов, замкнутость
// и наличие спиц.
function ring(i, n, p, out) {
  const s = p.size;
  const rad = R * s * 0.55;
  // У одной вариации ОДИН приём, а не все сразу. Когда кольцо разом получало вложенные
  // ободы, спицы и разрыв, от кольца ничего не оставалось: замер уводил такую вариацию
  // в решётку. Разнообразие берётся из выбора приёма и размера, а не из их наложения.
  const trait = Math.floor(p.trait * 2.99);   // 0 — ободы, 1 — спицы, 2 — разрыв
  const bands = trait === 0 ? 1 + Math.floor(p.aspect * 2.99) : 1;
  const arc = trait === 2 ? 0.6 + p.taper * 0.3 : 1;
  const spokes = trait === 1 ? 5 + Math.floor(p.aspect * 8) : 0;
  const spokeShare = spokes ? Math.floor(n * 0.22) : 0;
  if (i < spokeShare) {
    // Спица идёт от обода внутрь и НЕ ДОХОДИТ до середины: у кольца середина пуста —
    // на референсе это кольцо глифов вокруг тёмной точки.
    const k = i % spokes;
    const t = (Math.floor(i / spokes) + 0.5) / Math.max(1, Math.floor(spokeShare / spokes));
    const a = (k / spokes) * TAU;
    const rr = rad * (0.62 + t * 0.38);
    out[0] = Math.cos(a) * rr;
    out[1] = 0;
    out[2] = Math.sin(a) * rr;
    return out;
  }
  const j = i - spokeShare;
  const k = j % bands;
  const t = Math.floor(j / bands) / Math.max(1, Math.floor((n - spokeShare) / bands));
  const a = t * TAU * arc;
  // Обод — ПОЛОСА, а не волосок. Кольцо нулевой толщины вырождается: у него нет ни
  // размаха по высоте, ни объёма, и любой замер профиля по такому предмету — деление
  // на ноль по существу. На референсе кольца всегда полосы глифов.
  const tube = rad * (0.04 + p.thickness * 0.07);
  const jr = (((i * 2654435761) % 1013) / 1013 - 0.5) * 2;
  const jn = (((i * 40503) % 1009) / 1009 - 0.5) * 2;
  const rr = rad * (1 - k * (0.08 + p.thickness * 0.1)) + jr * tube;
  // Наклон — третья ось вариации: кольцо лежит на полу, стоит наклонно или стоит стоймя.
  // Двух осей (приём и размер) на шесть вариаций не хватало: три из шести совпадали.
  // Наклон не доходит до отвеса: кольцо, поставленное стоймя, — это уже проём, то есть
  // арка, и замер справедливо уводил такие вариации в неё. Стоячий проём в этом словаре
  // рисует арка, у неё для того и есть стойки.
  const tilt = step(p.trait2, 3) * 0.95;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const x = Math.cos(a) * rr;
  const y0 = (k - bands / 2) * R * s * 0.03 * p.thickness + jn * tube;
  const z0 = Math.sin(a) * rr;
  out[0] = x;
  out[1] = y0 * ct + z0 * st;
  out[2] = z0 * ct - y0 * st;
  return out;
}

// Ромб: октаэдр. Середина по высоте самая широкая — этим он отличается от тетраэдра.
function diamond(i, n, p, out) {
  const s = p.size;
  const w = R * s * (0.35 + p.thickness * 0.3);
  const h = R * s * (0.45 + p.aspect * 0.75);
  const d = R * s * (0.35 + p.taper * 0.3);
  const v = [[0, h, 0], [0, -h, 0], [w, 0, 0], [-w, 0, 0], [0, 0, d], [0, 0, -d]];
  const e = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5],
             [2, 4], [4, 3], [3, 5], [5, 2]];
  return edgeSample(v, e, i, n, out);
}

// Ветвь: дерево. Меняются глубина ветвления, число отростков и угол развода —
// облик дерева держится СТРОЕНИЕМ, а не толщиной.
function branch(i, n, p, out) {
  const segs = branchSegs(p);
  // Пятая часть точек уходит в СТВОЛ. Без этого дерево с тремя уровнями и широким
  // разводом читается проволочным многогранником, и замер уводил такую вариацию в ромб.
  // У дерева внизу один ствол, наверху крона — этой двугорбости нет ни у одной другой
  // формы, и держится она только тем, что ствол виден.
  const trunkShare = Math.floor(n * 0.2);
  if (i < trunkShare) {
    const [a0, b0] = segs[0];
    const t = (i + 0.5) / trunkShare;
    out[0] = a0[0] + (b0[0] - a0[0]) * t;
    out[1] = a0[1] + (b0[1] - a0[1]) * t;
    out[2] = a0[2] + (b0[2] - a0[2]) * t;
    return out;
  }
  const j = i - trunkShare;
  const rest = Math.max(1, segs.length - 1);
  const per = Math.max(1, Math.floor((n - trunkShare) / rest));
  const k = 1 + Math.min(rest - 1, Math.floor(j / per));
  const t = ((j % per) + 0.5) / per;
  const [a, b] = segs[k];
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}
const branchCache = new Map();
function branchSegs(p) {
  // Не меньше трёх уровней: двухуровневое дерево с широким разводом — это уже не крона,
  // а проволочный многогранник, и гейт справедливо уводил такие вариации в ромб.
  const levels = 3 + Math.floor(p.aspect * 2.99);
  const kidsBase = 2 + Math.floor(p.thickness * 2.99);
  const key = [Math.round(p.curvature * 60), levels, kidsBase,
               Math.round(p.size * 40), Math.round(p.taper * 40)].join(':');
  if (branchCache.has(key)) return branchCache.get(key);
  const segs = [];
  const spread = 0.35 + p.curvature * 0.85;
  const shrink = 0.5 + p.taper * 0.28;
  const grow = (x, y, z, len, ang, roll, lvl) => {
    if (lvl > levels) return;
    const kids = kidsBase + (lvl % 2);
    for (let k = 0; k < kids; k++) {
      // Ветви идут ВВЕРХ: угол от вертикали не больше 70 градусов. Поникшая ветвь
      // разрушает двугорбый силуэт, по которому дерево и опознаётся.
      const a = Math.max(-1.2, Math.min(1.2, ang + (k - (kids - 1) / 2) * spread));
      const rr = roll + k * 1.1;
      const nx = x + Math.sin(a) * Math.cos(rr) * len;
      const ny = y + Math.cos(a) * len;
      const nz = z + Math.sin(a) * Math.sin(rr) * len;
      segs.push([[x, y, z], [nx, ny, nz]]);
      grow(nx, ny, nz, len * shrink, a, rr, lvl + 1);
    }
  };
  const trunk = R * p.size * (0.3 + p.aspect * 0.4);
  segs.push([[0, 0, 0], [0, trunk, 0]]);
  grow(0, trunk, 0, trunk * 0.8, 0, 0, 0);
  if (branchCache.size > 400) branchCache.clear();
  branchCache.set(key, segs);
  return segs;
}

// Плита: грани здания с уступами. Уступы — то, чем постройки на референсе отличаются
// от простой коробки.
function slab(i, n, p, out) {
  const s = p.size;
  const w0 = R * s * (0.26 + p.thickness * 0.26);
  const h = R * s * (0.7 + p.aspect * 1.5);
  // Уступов не больше трёх, и каждый мелкий: постройка с четырьмя глубокими уступами
  // превращается в ступенчатую пирамиду и перестаёт быть постройкой. Сужение до точки —
  // это шпиль, у него для того и есть своя форма.
  const steps = 1 + Math.floor(p.taper * 2.99);
  // ТРИ независимых числа: вдоль грани, по высоте и выбор уступа. В первой редакции
  // одно число разом выбирало уступ и координату вдоль двух граней — коробка
  // вырождалась в косой лист, и замер уводил плиту в ромб. Широкий прогон поймал.
  const along = ((i * 7919) % 997) / 997;
  const up = ((i * 104729) % 991) / 991;
  const pick = ((i * 15485863) % 983) / 983;
  const stepK = Math.min(steps - 1, Math.floor(pick * steps));
  const w = w0 * (1 - stepK * 0.1);
  // Перекрытия: обод по верху каждого уступа. По ним постройка и читается этажами,
  // а не просто коробкой, и ни одна другая форма таких поясов не даёт.
  const deck = Math.floor(n * 0.18);
  if (i < deck) {
    const k = i % steps;
    const t = (Math.floor(i / steps) + 0.5) / Math.max(1, Math.floor(deck / steps));
    const ww = w0 * (1 - k * 0.1);
    const side = Math.floor(t * 4) % 4;
    const f = (t * 4) % 1;
    const a = (f - 0.5) * 2 * ww;
    if (side === 0) { out[0] = a; out[2] = ww; }
    else if (side === 1) { out[0] = ww; out[2] = -a; }
    else if (side === 2) { out[0] = -a; out[2] = -ww; }
    else { out[0] = -ww; out[2] = a; }
    out[1] = ((k + 1) / steps) * h;
    return out;
  }
  const face = i % 4;
  const a = (along - 0.5) * 2 * w;
  if (face === 0) { out[0] = a; out[2] = w; }
  else if (face === 1) { out[0] = a; out[2] = -w; }
  else if (face === 2) { out[0] = w; out[2] = a; }
  else { out[0] = -w; out[2] = a; }
  out[1] = (stepK + up) / steps * h;
  return out;
}

// Шпиль: сужающаяся к небу пирамида на рёбрах, с ободом у подножия.
function spire(i, n, p, out) {
  const s = p.size;
  // Шпиль ВЫСОКИЙ И ТОНКИЙ, тетраэдр — приземистый и широкий. Пока их пропорции
  // перекрывались, четырёхгранный шпиль и трёхгранная пирамида были одним и тем же.
  // Это и есть разница между обелиском и пирамидой, а не тонкость замера.
  const w = R * s * (0.11 + p.thickness * 0.1);
  const h = R * s * (1.2 + p.aspect * 1.8);
  // Рёбер всегда не меньше шести. Шпиль о четырёх рёбрах — это пирамида, то есть
  // тетраэдр под другим именем, и замер справедливо их путал.
  const ribs = 6 + Math.floor(p.curvature * 10);
  const base = Math.floor(n * 0.3);
  if (i < base) {
    const a = (i / base) * TAU;
    out[0] = Math.cos(a) * w; out[1] = 0; out[2] = Math.sin(a) * w;
    return out;
  }
  const j = i - base;
  const k = j % ribs;
  const t = Math.floor(j / ribs) / Math.max(1, Math.floor((n - base) / ribs));
  const a = (k / ribs) * TAU;
  const taper = Math.pow(1 - t, 0.5 + p.taper * 1.4);
  out[0] = Math.cos(a) * w * taper;
  out[1] = t * h;
  out[2] = Math.sin(a) * w * taper;
  return out;
}

// Тетраэдр: широкое основание и одна вершина. Низ тяжелее — этим отличается от ромба.
function tetra(i, n, p, out) {
  const s = p.size;
  const w = R * s * (0.45 + p.thickness * 0.3);
  const h = R * s * (0.35 + p.aspect * 0.55);
  const turn = p.curvature * TAU;
  const v = [[0, h, 0]];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + turn;
    v.push([Math.cos(a) * w, 0, Math.sin(a) * w * (0.7 + p.taper * 0.6)]);
  }
  const e = [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3], [3, 1]];
  return edgeSample(v, e, i, n, out);
}

// Купол: оболочка из параллелей и меридианов. Ею накрыт зал на референсе, и она же
// даёт сферу в его середине. Меняются доля полной сферы, густота сетки и приплюснутость.
function dome(i, n, p, out) {
  const s = p.size;
  const rad = R * s * 0.5;
  const squash = 0.5 + p.aspect * 0.9;              // приплюснутость
  const full = 0.55 + step(p.taper, 3) * 0.45;      // полусфера или почти шар
  const meridians = 5 + Math.floor(p.thickness * 8);
  const parallels = 4 + Math.floor(p.curvature * 6);
  const half = Math.floor(n * 0.5);
  if (i < half) {
    // параллели
    const k = i % parallels;
    const t = (Math.floor(i / parallels) + 0.5) / Math.max(1, Math.floor(half / parallels));
    const b = (k + 0.5) / parallels * Math.PI * full;
    const a = t * TAU;
    out[0] = Math.sin(b) * Math.cos(a) * rad;
    out[1] = Math.cos(b) * rad * squash;
    out[2] = Math.sin(b) * Math.sin(a) * rad;
    return out;
  }
  // меридианы
  const j = i - half;
  const k = j % meridians;
  const t = (Math.floor(j / meridians) + 0.5) / Math.max(1, Math.floor((n - half) / meridians));
  const a = (k / meridians) * TAU;
  const b = t * Math.PI * full;
  out[0] = Math.sin(b) * Math.cos(a) * rad;
  out[1] = Math.cos(b) * rad * squash;
  out[2] = Math.sin(b) * Math.sin(a) * rad;
  return out;
}
