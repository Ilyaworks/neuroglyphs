// Словарь знаков, которыми покрыты поверхности мира.
//
// Признак 27 референса: на кадрах символы ЛЕЖАТ НА ПОВЕРХНОСТЯХ — на стенах зданий,
// на стволах колонн, на сводах арок, на кольцах туннеля, на полу. Этот модуль отвечает
// на вопрос ЧТО класть; куда класть — дело surface.js.
//
// Девять родов разобраны по листу референса, а не придуманы. Два правила, без которых
// сходство рассыпается:
//
//   Обводка, а не заливка. Каждый знак нарисован светящейся линией и внутри пуст.
//   Залитый знак читается пятном.
//
//   Иерархия масштабов. На одной стене одновременно живут эмблема в этаж, вывески
//   среднего размера, строки мелких символов и решётка крошечных. Один размер на всю
//   поверхность — это обои, а не мир.
//
// Модуль НЕ импортирует three: он возвращает числа. Так его проверяют без браузера
// и без заглушек — сцена собирается из этих чисел уже снаружи.
//
// Договор: buildMark(kind, rng, opts) -> { kind, count, scale, hollow, fill(i, out) }
// fill пишет out[0]=u, out[1]=v в пределах [0,1] и out[2]=номер глифа; out[0] < 0
// означает, что точка пропускается.

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

// У каждого рода несколько рисунков. Один род с одним рисунком на весь мир — это
// повтор, которым уже дважды закрывались задачи R25 и R26. Вариант выбирается сидом.
export const MARK_VARIANTS = {
  emblem:  ["star", "chevron", "hexagram", "feline"],
  string:  ["plain", "spaced", "ticked"],
  formula: ["field", "wave", "sum"],
  panel:   ["plain", "tabbed", "double"],
  edge:    ["single", "double", "dashed"],
  rosette: ["clock", "mandala", "dial"],
  lattice: ["square", "hex", "alternating"],
  pattern: ["checker", "diamond", "zigzag"],
  marking: ["arc", "twin", "dashes"],
};

// Доля габарита поверхности, которую занимает знак. Отсюда и берётся иерархия:
// от решётки в два процента до линии по всему ребру.
const FOOTPRINT = {
  emblem:  [0.30, 0.46],
  pattern: [0.50, 0.72],
  marking: [0.66, 0.95],
  edge:    [0.80, 1.00],
  formula: [0.22, 0.38],
  panel:   [0.10, 0.18],
  rosette: [0.08, 0.16],
  string:  [0.05, 0.12],
  lattice: [0.018, 0.034],
};

const HOLLOW = new Set(["emblem", "panel", "rosette", "edge", "marking"]);

// ── алфавит ───────────────────────────────────────────────────────────────────
// Атлас держит ровно 128 глифов: греческие, математические, стрелки, фигуры, цифры.
// Латиницы в нём нет, поэтому формулы записаны греческими буквами и знаками, а
// равенство собрано из двух горизонтальных полос — так его и рисуют на кадрах.

const range = (a, n) => Array.from({ length: n }, (_, i) => a + i);

// Из фигур берутся только ПУСТЫЕ: залитые квадраты и треугольники на крупном узоре
// вырастают в светящиеся кляксы и съедают всю стену. Знак на референсе — линия.
const OUTLINE_SHAPES = [92, 94, 96, 98, 100, 101, 103, 105, 114, 116];

const GROUPS = {
  greek: range(0, 49),
  math:  range(49, 32),
  arrow: range(81, 10),
  shape: OUTLINE_SHAPES,
  digit: range(118, 10),
};
const GROUP_NAMES = Object.keys(GROUPS);

const BAR = 115;      // ▬ — из него собираются равенство и дробная черта
const DOT = 113;      // ▪ — из него собираются световые линии
const DASH = 116;     // ▭

const NABLA = 50, PARTIAL = 49, INF = 52, TIMES = 58, PM = 57;
const SUM = 60, INTEGRAL = 62, ROOT = 51, ELEM = 68, OTIMES = 80;
const PSI = 22, PHI = 20, LAMBDA = 10;
const alpha = 24, epsilon = 28, kappa = 33;
const mu = 35, nu = 36, xi = 37, rho = 40, tau = 43, omega = 48;

function pickGroup(rng) {
  return GROUPS[GROUP_NAMES[Math.floor(rng() * GROUP_NAMES.length)]];
}

// Алфавит мира приходит ЯВНО, через opts.glyphs. Держать его в переменной модуля было
// бы короче, но тогда от порядка вызовов начинает зависеть результат — а в этом проекте
// такие связи уже дважды выходили боком.
//
// Исключение одно: формула. Её глифы — это сама запись (∇, ×, Ψ, ∂), подменять их
// алфавитом значит превращать формулу в бессмыслицу.

function glyphRun(rng, n, group) {
  const g = group || pickGroup(rng);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = g[Math.floor(rng() * g.length)];
  return out;
}

function jitterRun(rng, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng() - 0.5;
  return out;
}

// ── обход ломаной ─────────────────────────────────────────────────────────────
// Знаки-обводки рисуются как путь, а точки раскладываются по нему РАВНОМЕРНО ПО ДЛИНЕ.
// Раскладка по номеру вершины сгущала бы точки на коротких звеньях, и обводка читалась
// бы пунктиром с комками.

function sampler(paths) {
  const segs = [];
  let total = 0;
  for (const p of paths) {
    const pts = p.pts;
    const m = p.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < m; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L <= 1e-9) continue;
      segs.push([a, b, L, total]);
      total += L;
    }
  }
  if (!segs.length) return () => [0.5, 0.5];
  return function (t) {
    const d = Math.min(total - 1e-9, Math.max(0, t) * total);
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid][3] <= d) lo = mid; else hi = mid - 1;
    }
    const s = segs[lo];
    const f = (d - s[3]) / s[2];
    return [s[0][0] + (s[1][0] - s[0][0]) * f, s[0][1] + (s[1][1] - s[0][1]) * f];
  };
}

function ring(cx, cy, r, steps) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return { pts, closed: true };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── эмблемы ───────────────────────────────────────────────────────────────────
// Радиус у эмблемы гуляет непрерывно — этим она и отличается от розетки, у которой
// радиусы дискретны. Если рисовать эмблему кольцами, гейт справедливо назовёт её
// близнецом розетки: разные имена при одном рисунке.

function starPath(rng) {
  const points = 5 + Math.floor(rng() * 3);
  const r0 = 0.46, r1 = 0.21 + rng() * 0.04;
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? r0 : r1;
    pts.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
  }
  return [{ pts, closed: true }];
}

// Стрела. Ствол широкий не для красоты: у узкого ствола его же грани проходят рядом
// с серединой знака, и обводка перестаёт считаться пустой.
function chevronPath() {
  return [{ pts: [
    [0.50, 0.96], [0.96, 0.50], [0.76, 0.50], [0.76, 0.05],
    [0.24, 0.05], [0.24, 0.50], [0.04, 0.50],
  ], closed: true }];
}

// Два треугольника ОДНОГО радиуса, повёрнутые друг к другу. Вложенный треугольник
// поменьше был бы ошибкой: его рёбра проходят у самой середины знака, и обводка
// перестаёт быть пустой внутри — прогон по вариантам поймал на этом 22% заливки.
function hexagramPath(rng) {
  const turn = rng() * 0.4;
  const tri = (r, off) => {
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + off;
      pts.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
    }
    return { pts, closed: true };
  };
  return [tri(0.46, turn), tri(0.46, turn + Math.PI / 3)];
}

// Кошачий силуэт с листа референса. Вырез между ушами неглубокий: глубокий вырез
// уводит обводку к середине знака, и знак читается залитым.
function felinePath() {
  return [{ pts: [
    [0.26, 0.54], [0.32, 0.88], [0.39, 0.70], [0.61, 0.70], [0.68, 0.88],
    [0.74, 0.54], [0.76, 0.24], [0.60, 0.04], [0.40, 0.04], [0.24, 0.24],
  ], closed: true }];
}

function buildEmblem(variant, rng, opts) {
  const paths = variant === "chevron" ? chevronPath()
    : variant === "hexagram" ? hexagramPath(rng)
    : variant === "feline" ? felinePath()
    : starPath(rng);
  const at = sampler(paths);
  const count = 260;
  const jx = jitterRun(rng, count), jy = jitterRun(rng, count);
  const gl = glyphRun(rng, count, opts && opts.glyphs);
  return {
    count,
    fill(i, out) {
      const p = at((i + 0.5) / count);
      out[0] = clamp01(p[0] + jx[i] * 0.006);
      out[1] = clamp01(p[1] + jy[i] * 0.006);
      out[2] = gl[i];
      return out;
    },
  };
}

// ── вывеска ───────────────────────────────────────────────────────────────────
// Рамка со скруглёнными углами и строка знака внутри — ровно как вывеска на здании.
// Строка сидит выше середины: залитая середина превращает вывеску в пятно.

function roundedRect(cx, cy, hw, hh, r) {
  const pts = [];
  const corners = [[cx + hw - r, cy + hh - r, 0], [cx - hw + r, cy + hh - r, Math.PI / 2],
                   [cx - hw + r, cy - hh + r, Math.PI], [cx + hw - r, cy - hh + r, -Math.PI / 2]];
  for (const [ox, oy, a0] of corners) {
    for (let k = 0; k <= 4; k++) {
      const a = a0 + (k / 4) * (Math.PI / 2);
      pts.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]);
    }
  }
  return { pts, closed: true };
}

function buildPanel(variant, rng, opts) {
  const hh = 0.26 + rng() * 0.04;
  const paths = [roundedRect(0.5, 0.5, 0.42, hh, 0.06)];
  // Вторая линия идёт ВПРИТИРКУ к первой. Отступи она внутрь — и её горизонтали
  // пройдут через середину вывески, а вывеска обязана быть пустой внутри.
  if (variant === "double") paths.push(roundedRect(0.5, 0.5, 0.365, hh * 0.93, 0.045));
  // Ушко наверху небольшое: крупное утягивает середину знака вверх, и нижняя грань
  // рамки оказывается внутри условной середины.
  if (variant === "tabbed") paths.push({ pts: [[0.42, 0.5 + hh], [0.42, 0.5 + hh + 0.05],
    [0.58, 0.5 + hh + 0.05], [0.58, 0.5 + hh]], closed: false });
  const at = sampler(paths);
  const frame = 176, inner = 10, count = frame + inner;
  const jx = jitterRun(rng, count), jy = jitterRun(rng, count);
  const gl = glyphRun(rng, count, opts && opts.glyphs);
  const top = 0.5 + hh * 0.66;
  return {
    count,
    fill(i, out) {
      if (i < frame) {
        const p = at((i + 0.5) / frame);
        out[0] = clamp01(p[0] + jx[i] * 0.005);
        out[1] = clamp01(p[1] + jy[i] * 0.005);
      } else {
        const k = (i - frame) / (inner - 1);
        out[0] = 0.34 + k * 0.32;
        out[1] = clamp01(top + jy[i] * 0.01);
      }
      out[2] = gl[i];
      return out;
    },
  };
}

// ── розетка ───────────────────────────────────────────────────────────────────
// Концентрические кольца с делениями: циферблат, мандала, шкала. Радиусы дискретны —
// это её опознавательный признак против эмблемы.

function buildRosette(variant, rng, opts) {
  const rings = variant === "dial" ? [0.26, 0.46] : [0.24, 0.34, 0.46];
  const paths = rings.map((r) => ring(0.5, 0.5, r, 40));
  const ticks = variant === "clock" ? 12 : variant === "mandala" ? 24 : 36;
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    paths.push({ pts: [[0.5 + c * 0.46, 0.5 + s * 0.46], [0.5 + c * 0.50, 0.5 + s * 0.50]], closed: false });
  }
  const at = sampler(paths);
  const count = 240;
  const jx = jitterRun(rng, count), jy = jitterRun(rng, count);
  const gl = glyphRun(rng, count, (opts && opts.glyphs) || GROUPS.digit);
  return {
    count,
    fill(i, out) {
      const p = at((i + 0.5) / count);
      out[0] = clamp01(p[0] + jx[i] * 0.005);
      out[1] = clamp01(p[1] + jy[i] * 0.005);
      out[2] = gl[i];
      return out;
    },
  };
}

// ── световая линия по ребру ───────────────────────────────────────────────────
// Ею обведены контуры построек, арок и проёмов: по ней и читается сама форма здания.
// Глифы стоят так плотно, что линия видна линией, а не цепочкой значков.

function buildEdge(variant, rng, opts) {
  const count = 320;
  const j = jitterRun(rng, count);
  const gl = new Uint8Array(count);
  for (let i = 0; i < count; i++) gl[i] = i % 5 === 0 ? DASH : (i % 2 ? BAR : DOT);
  const gap = 0.012;
  return {
    count,
    fill(i, out) {
      if (variant === "dashed" && Math.floor(i / 9) % 4 === 3) { out[0] = -1; return out; }
      const half = variant === "double" ? (i % 2 ? gap : -gap) : 0;
      out[0] = 0.01 + (i / (count - 1)) * 0.98;
      out[1] = 0.5 + half + j[i] * 0.004;
      out[2] = gl[i];
      return out;
    },
  };
}

// ── строка ────────────────────────────────────────────────────────────────────

function buildString(variant, rng, opts) {
  const count = 44;
  const j = jitterRun(rng, count);
  const gl = glyphRun(rng, count, opts && opts.glyphs);
  return {
    count,
    fill(i, out) {
      if (variant === "spaced" && i % 8 === 7) { out[0] = -1; return out; }
      out[0] = 0.02 + (i / (count - 1)) * 0.96;
      out[1] = 0.5 + (variant === "ticked" && i % 5 === 0 ? 0.02 : 0) + j[i] * 0.012;
      out[2] = gl[i];
      return out;
    },
  };
}

// ── формула ───────────────────────────────────────────────────────────────────
// Настоящая запись, а не россыпь: основание, верхние и нижние индексы, дробь и
// равенство из двух полос. Этим формула отличается от строки замером, а не на слово.
//
// Роли: b — основание, s — верхний индекс, u — нижний, n — числитель, d — знаменатель.

const FORMULAS = {
  field: [["b", NABLA], ["b", TIMES], ["b", PSI], ["b", PM], ["b", NABLA], ["b", OTIMES],
          ["b", PHI], ["=", 0], ["n", PARTIAL], ["n", PHI], ["d", PARTIAL], ["d", tau],
          ["b", PM], ["b", INTEGRAL], ["b", mu], ["b", rho]],
  wave:  [["b", PSI], ["u", kappa], ["=", 0], ["b", alpha], ["b", epsilon],
          ["s", omega], ["s", tau], ["s", PM], ["s", xi], ["b", PM], ["b", LAMBDA],
          ["b", OTIMES], ["b", PHI], ["b", ELEM], ["b", ROOT], ["b", nu]],
  sum:   [["b", SUM], ["u", nu], ["s", INF], ["b", LAMBDA], ["b", mu], ["=", 0],
          ["b", INTEGRAL], ["b", PARTIAL], ["b", rho], ["b", TIMES], ["b", PSI],
          ["n", alpha], ["n", omega], ["d", tau], ["d", xi], ["b", PM], ["b", epsilon]],
};

function buildFormula(variant, rng, opts) {
  const tokens = FORMULAS[variant] || FORMULAS.field;
  // Раскладка по столбцам: основание и равенство занимают столбец, индексы садятся
  // на предыдущий, дробь — общий столбец на числитель и знаменатель.
  let col = -1;
  let fracCol = -1;
  const placed = [];
  for (const [role, g] of tokens) {
    if (role === "b" || role === "=") { col++; }
    if (role === "n" || role === "d") {
      if (fracCol < 0) { col++; fracCol = col; }
      placed.push([role, g, fracCol]);
      continue;
    }
    placed.push([role, g, Math.max(0, col)]);
  }
  const width = col + 1;
  const glyphs = [];
  // Индексы и дробь держатся близко к строке: чем выше они забираются, тем меньше
  // запись похожа на строку и тем ближе она к порогу «читается полосой».
  for (const [role, g, c] of placed) {
    const x = 0.02 + ((c + 0.5) / width) * 0.96;
    if (role === "=") {
      glyphs.push([x, 0.545, BAR]);
      glyphs.push([x, 0.455, BAR]);
    } else if (role === "s") glyphs.push([x + 0.02, 0.60, g]);
    else if (role === "u") glyphs.push([x + 0.02, 0.40, g]);
    else if (role === "n") glyphs.push([x, 0.62, g]);
    else if (role === "d") glyphs.push([x, 0.38, g]);
    else glyphs.push([x, 0.50, g]);
  }
  // Дробная черта: полосы поперёк столбца дроби.
  if (fracCol >= 0) {
    const x0 = 0.02 + (fracCol / width) * 0.96;
    for (let k = 0; k < 5; k++) glyphs.push([x0 + (k / 5) * (0.96 / width), 0.50, BAR]);
  }
  // Индексы и дробь остаются меньшинством: иначе запись перестаёт читаться строкой
  // и валит проверку на полосу. Длина набирается длиной самой записи, а не повтором
  // одного знака со сдвигом — от повтора на контактном листе оставалась пустая строка
  // из пяти значков вместо формулы.
  const dense = glyphs;
  const count = dense.length;
  const j = jitterRun(rng, count);
  return {
    count,
    fill(i, out) {
      const g = dense[i];
      out[0] = clamp01(g[0]);
      out[1] = clamp01(g[1] + j[i] * 0.008);
      out[2] = g[2];
      return out;
    },
  };
}

// ── решётка ───────────────────────────────────────────────────────────────────
// Обои: знак в каждом узле сетки, шаг идеально ровный. Ровностью шага решётка и
// отличается от крупного узора, у которого точки сбиты в блоки.

function buildLattice(variant, rng, opts) {
  const side = 6 + Math.floor(rng() * 2);
  const count = side * side;
  const gl = glyphRun(rng, count, opts && opts.glyphs);
  const alt = glyphRun(rng, count, opts && opts.glyphs);
  return {
    count,
    fill(i, out) {
      const x = i % side, y = Math.floor(i / side);
      const odd = variant === "hex" ? (y % 2) * 0.5 : 0;
      out[0] = clamp01((x + 0.5 + odd) / side);
      out[1] = (y + 0.5) / side;
      out[2] = variant === "alternating" && (x + y) % 2 ? alt[i] : gl[i];
      return out;
    },
  };
}

// ── крупный узор ──────────────────────────────────────────────────────────────
// Шахматная клетка пола в зале, кольца под ногами в туннеле, зигзаг вдоль улицы.

function buildPattern(variant, rng, opts) {
  const side = 8;
  const count = 420;
  const jx = jitterRun(rng, count), jy = jitterRun(rng, count);
  const gl = glyphRun(rng, count, (opts && opts.glyphs) || GROUPS.shape);
  return {
    count,
    fill(i, out) {
      const cell = i % (side * side);
      const cx = cell % side, cy = Math.floor(cell / side);
      let keep;
      if (variant === "diamond") keep = Math.abs(cx - cy) % 3 === 0;
      else if (variant === "zigzag") keep = (cy % 4) === (cx % 4) || (cy % 4) === 3 - (cx % 4);
      else keep = (cx + cy) % 2 === 0;
      if (!keep) { out[0] = -1; return out; }
      out[0] = clamp01((cx + 0.5 + jx[i] * 0.55) / side);
      out[1] = clamp01((cy + 0.5 + jy[i] * 0.55) / side);
      out[2] = gl[i];
      return out;
    },
  };
}

// ── разметка ──────────────────────────────────────────────────────────────────
// Длинные светящиеся дуги и полосы, идущие вдоль улицы по полу.

function buildMarking(variant, rng, opts) {
  const count = 130;
  const j = jitterRun(rng, count);
// Прогиб и раздвоение вместе съедают запас по «читается полосой»: при прогибе 0.23
  // и раздвоении 0.075 главная ось падала до 88%. Держим оба умеренными.
  const bow = 0.16 + rng() * 0.04;
  const gl = new Uint8Array(count);
  for (let i = 0; i < count; i++) gl[i] = i % 3 === 0 ? DASH : BAR;
  return {
    count,
    fill(i, out) {
      if (variant === "dashes" && Math.floor(i / 6) % 3 === 2) { out[0] = -1; return out; }
      const t = i / (count - 1);
      out[0] = 0.02 + t * 0.96;
      // Прогиб есть у КАЖДОГО варианта: прямая двойная полоса — это уже световая
      // линия по ребру, и прогон по вариантам справедливо назвал их близнецами.
      const lane = variant === "twin" ? (i % 2 ? 0.046 : -0.046) : 0;
      out[1] = clamp01(0.5 - bow * 0.5 + Math.sin(t * Math.PI) * bow + lane + j[i] * 0.006);
      out[2] = gl[i];
      return out;
    },
  };
}

const BUILD = {
  emblem: buildEmblem,
  string: buildString,
  formula: buildFormula,
  panel: buildPanel,
  edge: buildEdge,
  rosette: buildRosette,
  lattice: buildLattice,
  pattern: buildPattern,
  marking: buildMarking,
};

export function buildMark(kind, rng, opts = {}) {
  if (!MARK_KINDS.includes(kind)) throw new Error("неизвестный род знака: " + kind);
  const variants = MARK_VARIANTS[kind];
  const variant = opts.variant && variants.includes(opts.variant)
    ? opts.variant
    : variants[Math.floor(rng() * variants.length)];
  const fp = FOOTPRINT[kind];
  const scale = opts.scale !== undefined
    ? Math.min(1, Math.max(0.001, opts.scale))
    : fp[0] + rng() * (fp[1] - fp[0]);
  const built = BUILD[kind](variant, rng, opts);
  return { kind, variant, count: built.count, scale, hollow: HOLLOW.has(kind), fill: built.fill };
}
