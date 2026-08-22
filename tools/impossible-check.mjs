// Проверка невозможных фигур: читаются ли они из точки привязки и ломаются ли при отходе.
//
//   node tools/impossible-check.mjs
//   node tools/impossible-check.mjs --mod tools/fixture-impossible.js
//   node tools/impossible-check.mjs --mutate coincide
//
// Зачем: невозможная фигура — единственная вещь в этом проекте, которую нельзя принять
// глазами. Разница между настоящим треугольником Пенроуза и просто кривой рамкой — это
// один-два пикселя расхождения в проекции, и на глаз она не видна ни на кадре, ни в
// описании. Поэтому фигура обязана сама сказать, какие концы у неё сходятся (`seams`),
// а инструмент проецирует их из точки привязки и мерит три вещи: сходятся ли они на
// экране, расходятся ли в пространстве, и растёт ли расхождение при отходе камеры.
//
// Браузер не нужен: проекция — это арифметика, и считать её честнее самому, чем сверять
// скриншоты.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const rawMod = arg('mod', 'src/atmosphere/impossible.js').split('\\').join('/');
const LOCAL = (rawMod.match(/(?:tools|src)\/.*/) || [rawMod.replace(/^\//, '')])[0];
const MUTATE = arg('mutate', '');

// Пороги — из текста задачи, замеры на эталоне печатаются рядом с каждым.
const MIN_KINDS = 3;          // видов фигур
const PROBE_COUNT = 2000;
const SEAM_SCREEN_MAX = 0.01; // расхождение в проекции к диагонали кадра фигуры
const SEAM_SPACE_MIN = 0.20;  // расхождение в пространстве к габариту фигуры
const BREAK_GROWTH_MIN = 10;  // во сколько раз расхождение растёт при отходе на 30°
const TURN_DEG = 30;
const NEAR_SEAM_MAX = 0.03;   // как близко к концу шва обязана лежать нарисованная точка
const SCALE_MIN = 1.6;        // отклик габарита на extent
const SCALE_MAX = 2.4;
const W = 800, H = 600, FOV_DEG = 60;

const problems = [];
const bad = (m) => problems.push(m);

if (!fs.existsSync(LOCAL)) {
  console.error(LOCAL + ' не найден');
  console.error('IMPOSSIBLE_FAIL');
  process.exit(1);
}

let mod;
try {
  mod = await import(pathToFileURL(path.resolve(LOCAL)).href);
} catch (e) {
  console.error('модуль не импортируется: ' + (e && e.message));
  console.error('IMPOSSIBLE_FAIL');
  process.exit(1);
}
if (typeof mod.buildImpossible !== 'function') {
  console.error('нет экспорта buildImpossible(kind, anchor, opts) — проверять нечего');
  console.error('IMPOSSIBLE_FAIL');
  process.exit(1);
}

const MUTATIONS = {
  coincide: 'концы шва совпадают и в пространстве — фигура честная, иллюзии нет',
  misalign: 'концы шва не сходятся в проекции — просто кривая рамка',
  fakeseam: 'шов объявлен там, где фигура не нарисована',
  onekind: 'вид фигуры всегда один',
  nan: 'каждая тысячная точка выходит NaN',
  nondet: 'точки зависят от Math.random',
  noextent: 'габарит игнорируется',
};
if (MUTATE && !MUTATIONS[MUTATE]) {
  console.error('нет такой мутации: ' + MUTATE + '. Есть: ' + Object.keys(MUTATIONS).join(', '));
  process.exit(1);
}

const KINDS = (Array.isArray(mod.IMPOSSIBLE_KINDS) && mod.IMPOSSIBLE_KINDS.length)
  ? mod.IMPOSSIBLE_KINDS
  : ['penroseTriangle'];

const buildRaw = mod.buildImpossible;
const build = (kind, anchor, opts = {}) => {
  const o = { ...opts };
  if (MUTATE === 'noextent') o.extent = 200;
  const got = buildRaw(MUTATE === 'onekind' ? KINDS[0] : kind, anchor, o);
  if (!got || typeof got.fill !== 'function') return got;
  const fill = got.fill.bind(got);
  let seams = Array.isArray(got.seams) ? got.seams.map(s => ({ a: [...s.a], b: [...s.b] })) : [];
  if (MUTATE === 'coincide') seams = seams.map(s => ({ a: s.a, b: [...s.a] }));
  if (MUTATE === 'misalign') {
    seams = seams.map(s => ({ a: s.a, b: [s.b[0] + (opts.extent ?? 200) * 0.3, s.b[1], s.b[2]] }));
  }
  if (MUTATE === 'fakeseam') {
    // Оба конца съезжают ВДОЛЬ своих лучей зрения: в проекции всё так же сходится,
    // расхождение в пространстве остаётся, но шва в этом месте фигура не рисует.
    const pull = (p) => [
      anchor[0] + (p[0] - anchor[0]) * 0.6,
      anchor[1] + (p[1] - anchor[1]) * 0.6,
      anchor[2] + (p[2] - anchor[2]) * 0.6,
    ];
    seams = seams.map(s => ({ a: pull(s.a), b: pull(s.b) }));
  }
  return {
    ...got, seams,
    fill(i, out) {
      fill(i, out);
      if (MUTATE === 'nan' && i % 1000 === 0) out[0] = NaN;
      if (MUTATE === 'nondet') out[0] += Math.random();
    },
  };
};

if (MUTATE) console.log('мутация: ' + MUTATE + ' — ' + MUTATIONS[MUTATE]);
console.log('модуль: ' + LOCAL + ', видов фигур: ' + KINDS.length + ' (' + KINDS.join(', ') + ')');

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Камера как в three: смотрим из eye в target, перспективная проекция в пиксели кадра.
function camera(eye, target) {
  const fwd = norm(sub(target, eye));
  const upHint = Math.abs(fwd[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
  const right = norm(cross(fwd, upHint));
  const up = cross(right, fwd);
  const f = 1 / Math.tan((FOV_DEG * Math.PI / 180) / 2);
  return (p) => {
    const d = sub(p, eye);
    const z = dot(d, fwd);
    if (z <= 1e-6) return null;
    const x = dot(d, right) / z;
    const y = dot(d, up) / z;
    return [W / 2 + x * f * (H / 2), H / 2 - y * f * (H / 2)];
  };
}

function cloud(fig, count) {
  const pts = [];
  const out = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    out[0] = 0; out[1] = 0; out[2] = 0;
    fig.fill(i, out);
    if (!out.every(Number.isFinite)) return { bad: 'не число на точке ' + i + ': ' + out.join(', ') };
    pts.push([out[0], out[1], out[2]]);
  }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let d = 0; d < 3; d++) {
    if (p[d] < mn[d]) mn[d] = p[d];
    if (p[d] > mx[d]) mx[d] = p[d];
  }
  const size = len(sub(mx, mn));
  const center = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  let hash = 2166136261;
  for (const p of pts) for (const v of p) {
    hash ^= Math.round(v * 100) | 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return { pts, size, center, hash };
}

// Точка привязки: сбоку и сверху, чтобы фигура не смотрела строго по оси — так честнее.
const EXTENT = 200;
const ANCHOR = [EXTENT * 1.2, EXTENT * 0.8, EXTENT * 3];

if (KINDS.length < MIN_KINDS) {
  bad('видов фигур ' + KINDS.length + ', нужно не меньше ' + MIN_KINDS +
    '. Экспортируй список в IMPOSSIBLE_KINDS.');
}

let checked = 0;
const byKind = new Map();
const sizes = new Map();
for (const kind of KINDS) {
  let fig;
  try {
    fig = build(kind, ANCHOR, { count: PROBE_COUNT, extent: EXTENT });
  } catch (e) {
    bad('buildImpossible падает на виде ' + kind + ': ' + e.message);
    continue;
  }
  if (!fig || typeof fig.fill !== 'function') {
    bad('вид ' + kind + ': вернулся объект без fill(i, out)');
    continue;
  }
  const c = cloud(fig, PROBE_COUNT);
  if (c.bad) { bad('вид ' + kind + ' даёт ' + c.bad); continue; }
  if (fig.count !== PROBE_COUNT) {
    bad('вид ' + kind + ': попросили ' + PROBE_COUNT + ' точек, отдано count=' + fig.count);
  }
  byKind.set(kind, c.hash);
  sizes.set(kind, c.size);
  if (fig.kind !== undefined && fig.kind !== kind) {
    bad('попросили вид ' + kind + ', а вернулся ' + fig.kind + ': список IMPOSSIBLE_KINDS ' +
      'обещает виды, которых модуль не строит.');
  }
  if (!Array.isArray(fig.seams) || !fig.seams.length) {
    bad('вид ' + kind + ' не отдал ни одного шва в seams. Без этого проверить иллюзию ' +
      'нельзя: разница между невозможной фигурой и кривой рамкой — пара пикселей.');
    continue;
  }
  checked++;

  const projAnchor = camera(ANCHOR, c.center);
  // Отход: камера уезжает на TURN_DEG вокруг центра фигуры, расстояние то же.
  const rel = sub(ANCHOR, c.center);
  const a = (TURN_DEG * Math.PI) / 180;
  const turned = [
    c.center[0] + rel[0] * Math.cos(a) + rel[2] * Math.sin(a),
    c.center[1] + rel[1],
    c.center[2] - rel[0] * Math.sin(a) + rel[2] * Math.cos(a),
  ];
  const projTurned = camera(turned, c.center);
  const screenDiag = Math.hypot(W, H);

  console.log('');
  console.log('вид ' + kind + ': габарит ' + c.size.toFixed(1) + ', швов ' + fig.seams.length);
  fig.seams.forEach((s, idx) => {
    const pa = projAnchor(s.a), pb = projAnchor(s.b);
    if (!pa || !pb) {
      bad('вид ' + kind + ', шов ' + idx + ': конец шва за спиной камеры — из точки ' +
        'привязки его не видно вовсе');
      return;
    }
    const gap = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) / screenDiag;
    const spaceGap = len(sub(s.a, s.b)) / (c.size || 1);
    const ta = projTurned(s.a), tb = projTurned(s.b);
    const gapTurned = (ta && tb) ? Math.hypot(ta[0] - tb[0], ta[1] - tb[1]) / screenDiag : Infinity;
    const growth = gap > 1e-9 ? gapTurned / gap : (gapTurned > SEAM_SCREEN_MAX ? Infinity : 0);
    // Шов обязан лежать на нарисованной фигуре, а не быть объявленным в пустоте.
    const nearA = Math.min(...c.pts.map(p => len(sub(p, s.a)))) / (c.size || 1);
    const nearB = Math.min(...c.pts.map(p => len(sub(p, s.b)))) / (c.size || 1);

    console.log('  шов ' + idx +
      ': в проекции ' + gap.toFixed(5) + ' (нужно ≤ ' + SEAM_SCREEN_MAX + ')' +
      ', в пространстве ' + spaceGap.toFixed(3) + ' (нужно ≥ ' + SEAM_SPACE_MIN + ')' +
      ', при отходе ' + gapTurned.toFixed(5) + ', рост ' +
      (growth === Infinity ? '∞' : growth.toFixed(1)) + 'x (нужно ≥ ' + BREAK_GROWTH_MIN + ')' +
      ', концы на фигуре ' + nearA.toFixed(3) + '/' + nearB.toFixed(3) +
      ' (нужно ≤ ' + NEAR_SEAM_MAX + ')');

    if (!(gap <= SEAM_SCREEN_MAX)) {
      bad('вид ' + kind + ', шов ' + idx + ': из точки привязки концы расходятся на ' +
        gap.toFixed(5) + ' диагонали кадра при допуске ' + SEAM_SCREEN_MAX +
        '. Фигура не читается замкнутой — это просто рамка с разрывом.');
    }
    if (!(spaceGap >= SEAM_SPACE_MIN)) {
      bad('вид ' + kind + ', шов ' + idx + ': в пространстве концы отстоят на ' +
        spaceGap.toFixed(3) + ' габарита при пороге ' + SEAM_SPACE_MIN + '. Если они рядом, ' +
        'фигура честная и никакой невозможности в ней нет.');
    }
    if (!(growth >= BREAK_GROWTH_MIN)) {
      bad('вид ' + kind + ', шов ' + idx + ': при отходе на ' + TURN_DEG + '° расхождение ' +
        'выросло всего в ' + (growth === Infinity ? '∞' : growth.toFixed(1)) + ' раз при пороге ' +
        BREAK_GROWTH_MIN + '. Иллюзия обязана ломаться при облёте — на этом держится ' +
        'признак 12 референса.');
    }
    if (!(nearA <= NEAR_SEAM_MAX && nearB <= NEAR_SEAM_MAX)) {
      bad('вид ' + kind + ', шов ' + idx + ': ближайшая нарисованная точка отстоит от концов ' +
        'шва на ' + nearA.toFixed(3) + ' и ' + nearB.toFixed(3) + ' габарита при допуске ' +
        NEAR_SEAM_MAX + '. Шов объявлен там, где фигуры нет.');
    }
  });

  // Габарит слушает extent.
  const small = build(kind, ANCHOR, { count: 600, extent: EXTENT / 2 });
  const large = build(kind, ANCHOR, { count: 600, extent: EXTENT });
  if (small && large && typeof small.fill === 'function' && typeof large.fill === 'function') {
    const cs = cloud(small, 600), cl = cloud(large, 600);
    if (!cs.bad && !cl.bad && cs.size > 0) {
      const ratio = cl.size / cs.size;
      console.log('  отклик на габарит (extent x2): ' + ratio.toFixed(3) + ' (нужно в полосе ' +
        SCALE_MIN + '…' + SCALE_MAX + ')');
      if (ratio < SCALE_MIN || ratio > SCALE_MAX) {
        bad('вид ' + kind + ' не слушает extent: удвоение меняет габарит в ' + ratio.toFixed(3) +
          ' раз при полосе ' + SCALE_MIN + '…' + SCALE_MAX + '.');
      }
    }
  }

  // Детерминизм: правило 7.
  const again = cloud(build(kind, ANCHOR, { count: PROBE_COUNT, extent: EXTENT }), PROBE_COUNT);
  if (again.bad || again.hash !== c.hash) {
    bad('вид ' + kind + ': два вызова с теми же аргументами дали разные точки — нарушено ' +
      'правило 7. Обычно Math.random внутри или общее изменяемое состояние.');
  }
}

if (!checked) bad('ни один вид фигуры не удалось проверить');

// Один и тот же extent обязан давать фигуры сопоставимого размера. Иначе «габарит 200»
// значит для каждого вида своё: на первом прогоне N64 треугольник занимал 357 единиц,
// лестница 331, а вилка 146 — в мире это объект вдвое меньше при том же запросе, и разрыв
// шва при отходе у неё выходил 11.6 пикселя против 126.5 у треугольника, то есть иллюзия
// почти не ломалась. Порог по разбросу, а не по абсолютному размеру: на эталоне разброс
// 1.08, запас до двойки почти двукратный.
const SIZE_SPREAD_MAX = 2.0;
if (sizes.size > 1) {
  const vals = [...sizes.values()];
  const spread = Math.max(...vals) / Math.min(...vals);
  const big = [...sizes.entries()].reduce((w, e) => (e[1] > w[1] ? e : w));
  const small = [...sizes.entries()].reduce((w, e) => (e[1] < w[1] ? e : w));
  console.log('разброс размеров при одном extent: ' + spread.toFixed(2) + ' (нужно не больше ' +
    SIZE_SPREAD_MAX + '), крупнее всех ' + big[0] + ' ' + big[1].toFixed(0) +
    ', мельче всех ' + small[0] + ' ' + small[1].toFixed(0));
  if (spread > SIZE_SPREAD_MAX) {
    bad('при одном и том же extent виды получаются разного размера: ' + big[0] + ' занимает ' +
      big[1].toFixed(0) + ', а ' + small[0] + ' всего ' + small[1].toFixed(0) + ', разброс ' +
      spread.toFixed(2) + ' при допуске ' + SIZE_SPREAD_MAX + '. Мелкая фигура и ломается ' +
      'слабее: разрыв шва при отходе у неё в пикселях кратно меньше, и на кадре иллюзия ' +
      'продолжает выглядеть целой.');
  }
}

// Виды обязаны отличаться друг от друга. Иначе список из трёх имён — это одна фигура,
// построенная трижды: каждый вид по отдельности проходит все замеры, и без этой сверки
// подмена не видна вовсе.
if (byKind.size > 1) {
  const distinct = new Set(byKind.values()).size;
  console.log('разных фигур на ' + byKind.size + ' видах: ' + distinct);
  if (distinct < byKind.size) {
    const groups = new Map();
    for (const [k, h] of byKind) groups.set(h, (groups.get(h) || []).concat(k));
    const same = [...groups.values()].filter(g => g.length > 1).map(g => g.join(' и '));
    bad('разные виды дали побайтово одну фигуру: ' + same.join('; ') + '. Аргумент kind ' +
      'не читается — список видов обещает больше, чем модуль строит.');
  }
}

console.log('');
if (problems.length) {
  for (const p of problems) console.error('  x ' + p);
  console.error('');
  console.error('IMPOSSIBLE_FAIL');
  process.exit(1);
}
console.log('IMPOSSIBLE_OK');
