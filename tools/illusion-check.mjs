// Проверка нового набора форм: те же метрики, что у каталога, плюс сверка на близнецов
// и два признака референса, которых в каталоге нет вовсе.
//
//   node tools/illusion-check.mjs
//   node tools/illusion-check.mjs --mod tools/fixture-illusions.js
//   node tools/illusion-check.mjs --mutate nodip
//
// Зачем: у задачи на новые формы естественная проверка — «посмотри, красиво ли», а её
// проходит что угодно. Метрики тут те же, что в tools/shape-check.mjs (заполненность
// объёма, доля точек в центре и на периферии, пик радиальной корзины, провал плотности),
// считаются на 6000 точках с теми же параметрами — иначе числа несравнимы с каталогом.
//
// Отдельно ловятся близнецы. В наследственном наборе, который жил в проекте, из 169 форм
// около сотни были torusSpiral2…10, torusWave2…10 и подобные: одна форма, размноженная
// номером. Пятнадцать вариантов одной ленты Мёбиуса не считаются за пятнадцать форм,
// поэтому радиальные профили сверяются и между новыми формами, и против каталога.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const rawMod = arg('mod', 'src/world/shapeIllusions.js').split('\\').join('/');
const LOCAL = (rawMod.match(/(?:tools|src)\/.*/) || [rawMod.replace(/^\//, '')])[0];
const MUTATE = arg('mutate', '');

// Пороги. Первые четыре — из каталога, их менять нельзя: иначе числа несравнимы.
const N = 6000, G = 16, BINS = 20;
const OCC_MIN = 0.12;       // ниже — это нить или каркас, а не форма
const PEAK_MAX = 0.45;      // выше — всё сбилось в одну тонкую оболочку
const CORE_EMPTY = 0.05;    // «честно пустая середина» — доля точек ближе 0.25 радиуса
const DIP_MIN = 1.3;        // провал плотности между ядром и кольцом
// Требования задачи.
const MIN_FORMS = 16;
const MIN_DIP_FORMS = 8;    // признак 10 референса
const MIN_HOLLOW_FORMS = 12; // признак 11 референса
// Близнецы: L1-расстояние между радиальными профилями из 20 корзин. На эталоне худшая
// пара — соседние варианты одного семейства, 0.061; у точной копии выходит ровно 0.
// Порог 0.03 ловит копию и не трогает честного соседа — запас вдвое.
const TWIN_MIN = 0.03;
// Отклик на радиус: удвоил p.radius — обязан удвоиться габарит облака.
const SCALE_MIN = 1.6, SCALE_MAX = 2.4;

// Те же параметры, с которыми мерит каталог.
const P = {
  radius: 60, flatten: 0.8, distPow: 0.8, tubeR: 10, arms: 4, twist: 4, spread: 0.6,
  thickness: 8, strands: 3, turns: 4, clusterCount: 6, clusterRadius: 12,
  freq: 0.3, amp: 8, knotP: 3, knotQ: 4,
};

const problems = [];
const bad = (m) => problems.push(m);

if (!fs.existsSync(LOCAL)) {
  console.error(LOCAL + ' не найден');
  console.error('ILLUSION_FAIL');
  process.exit(1);
}

let mod;
try {
  mod = await import(pathToFileURL(path.resolve(LOCAL)).href);
} catch (e) {
  console.error('модуль не импортируется: ' + (e && e.message));
  console.error('ILLUSION_FAIL');
  process.exit(1);
}

const SHAPES = mod.ILLUSION_SHAPES || mod.SHAPES;
if (!SHAPES || typeof SHAPES !== 'object') {
  console.error('нет экспорта ILLUSION_SHAPES — объекта с формами вида (i, params, out)');
  console.error('ILLUSION_FAIL');
  process.exit(1);
}
const KEYS = Object.keys(SHAPES);

const MUTATIONS = {
  fewforms: 'форм меньше требуемого',
  nodip: 'ни у одной формы нет провала плотности',
  nohollow: 'у всех форм центр занят',
  twins: 'две формы — одна и та же, вызванная дважды',
  thread: 'одна форма выродилась в нить',
  nan: 'форма даёт NaN',
  nondet: 'форма зависит от Math.random',
  noradius: 'радиус игнорируется',
};
if (MUTATE && !MUTATIONS[MUTATE]) {
  console.error('нет такой мутации: ' + MUTATE + '. Есть: ' + Object.keys(MUTATIONS).join(', '));
  process.exit(1);
}

// Мутации накладываются обёрткой на импортированный модуль: ломается не файл, а вид
// формы, который гейт получает. Так проверяется сам гейт, не трогая src/.
const shapeList = (() => {
  let list = KEYS.map(k => [k, SHAPES[k]]);
  if (MUTATE === 'fewforms') list = list.slice(0, MIN_FORMS - 1);
  if (MUTATE === 'nodip') {
    // Ядро придвигается к кольцу: провала между ними больше нет.
    list = list.map(([k, fn]) => [k, (i, p, out) => {
      fn(i, p, out);
      const r = Math.hypot(out[0], out[1], out[2]) || 1;
      const t = 0.45 + 0.5 * (r / p.radius);
      out[0] *= t * p.radius / r; out[1] *= t * p.radius / r; out[2] *= t * p.radius / r;
    }]);
  }
  if (MUTATE === 'nohollow') {
    // Каждая пятая точка сдвигается в самый центр: пустой середины не остаётся.
    list = list.map(([k, fn]) => [k, (i, p, out) => {
      fn(i, p, out);
      if (i % 5 === 0) { out[0] *= 0.05; out[1] *= 0.05; out[2] *= 0.05; }
    }]);
  }
  if (MUTATE === 'twins' && list.length > 1) list[1] = [list[1][0], list[0][1]];
  if (MUTATE === 'thread' && list.length) {
    list[0] = [list[0][0], (i, p, out) => {
      const t = (i % N) / N;
      out[0] = Math.cos(t * 40) * p.radius * 0.02;
      out[1] = (t - 0.5) * 2 * p.radius;
      out[2] = Math.sin(t * 40) * p.radius * 0.02;
    }];
  }
  if (MUTATE === 'nan' && list.length) {
    const [k, fn] = list[0];
    list[0] = [k, (i, p, out) => { fn(i, p, out); if (i % 1000 === 0) out[1] = NaN; }];
  }
  if (MUTATE === 'nondet' && list.length) {
    const [k, fn] = list[0];
    list[0] = [k, (i, p, out) => { fn(i, p, out); out[0] += Math.random(); }];
  }
  if (MUTATE === 'noradius') {
    list = list.map(([k, fn]) => [k, (i, p, out) => fn(i, { ...p, radius: 60 }, out)]);
  }
  return list;
})();

// Замер формы: те же величины, что считает shape-check у каталога.
function measure(fn, params = P) {
  const pts = new Float64Array(N * 3);
  const out = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    out[0] = 0; out[1] = 0; out[2] = 0;
    fn(i, params, out);
    if (!out.every(Number.isFinite)) return { bad: 'не число на точке ' + i };
    pts[i * 3] = out[0]; pts[i * 3 + 1] = out[1]; pts[i * 3 + 2] = out[2];
  }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < N; i++) for (let d = 0; d < 3; d++) {
    const v = pts[i * 3 + d];
    if (v < mn[d]) mn[d] = v;
    if (v > mx[d]) mx[d] = v;
  }
  const cells = new Set();
  for (let i = 0; i < N; i++) {
    let idx = 0;
    for (let d = 0; d < 3; d++) {
      const span = (mx[d] - mn[d]) || 1;
      idx = idx * G + Math.min(G - 1, Math.floor((pts[i * 3 + d] - mn[d]) / span * G));
    }
    cells.add(idx);
  }
  const rs = [];
  for (let i = 0; i < N; i++) rs.push(Math.hypot(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]));
  const rmax = Math.max(...rs) || 1;
  const bins = new Array(BINS).fill(0);
  for (const r of rs) bins[Math.min(BINS - 1, Math.floor(r / rmax * BINS))]++;
  const share = bins.map(v => v / N);
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const gapAvg = avg(share.slice(5, 12)) || 1e-9;
  let hash = 2166136261;
  for (let i = 0; i < N * 3; i++) {
    hash ^= Math.round(pts[i] * 100) | 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return {
    occ: cells.size / (G * G * G),
    core: share.slice(0, 5).reduce((a, b) => a + b, 0),
    ring: share.slice(12).reduce((a, b) => a + b, 0),
    peak: Math.max(...share),
    dip: Math.min(avg(share.slice(0, 5)) / gapAvg, avg(share.slice(12)) / gapAvg),
    span: Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]),
    profile: share,
    hash,
  };
}

console.log('модуль: ' + LOCAL + ', форм: ' + shapeList.length +
  (MUTATE ? ' | мутация: ' + MUTATE + ' — ' + MUTATIONS[MUTATE] : ''));

const rows = [];
for (const [key, fn] of shapeList) {
  const m = measure(fn);
  if (m.bad) { bad('форма ' + key + ': ' + m.bad); continue; }
  rows.push({ key, ...m });
}

console.log('');
console.log('форма'.padEnd(18) + 'заполн  центр   кольцо  пик     провал');
for (const r of rows) {
  const flags = [];
  if (r.occ < OCC_MIN) flags.push('нить');
  if (r.peak > PEAK_MAX) flags.push('одна оболочка');
  console.log('  ' + r.key.padEnd(16) +
    [r.occ, r.core, r.ring, r.peak].map(v => v.toFixed(3)).join('   ') + '   ' +
    r.dip.toFixed(2) + 'x' + (flags.length ? '   <-- ' + flags.join(', ') : ''));
}

// 1. Барьеры каталога: не нить и не одна оболочка.
for (const r of rows) {
  if (r.occ < OCC_MIN) {
    bad('форма ' + r.key + ' — нить, а не форма: заполненность объёма ' + r.occ.toFixed(3) +
      ' при пороге ' + OCC_MIN + '. Красивая формула часто рисует линию, и на экране это ' +
      'струнка глифов в пустоте.');
  }
  if (r.peak > PEAK_MAX) {
    bad('форма ' + r.key + ' сбилась в одну оболочку: пик радиальной корзины ' +
      r.peak.toFixed(3) + ' при допуске ' + PEAK_MAX + '.');
  }
}

// 2. Сколько форм вообще.
console.log('');
console.log('форм: ' + rows.length + ' (нужно не меньше ' + MIN_FORMS + ')');
if (rows.length < MIN_FORMS) {
  bad('форм всего ' + rows.length + ' при требовании ' + MIN_FORMS + '.');
}

// 3. Признак 10: кольцо вокруг ядра с пустотой между ними.
const withDip = rows.filter(r => r.dip >= DIP_MIN);
console.log('с провалом ≥ ' + DIP_MIN + ': ' + withDip.length + ' (нужно не меньше ' +
  MIN_DIP_FORMS + ')' + (withDip.length ? ' — ' + withDip.map(r => r.key).join(' ') : ''));
if (withDip.length < MIN_DIP_FORMS) {
  bad('форм с провалом плотности ≥ ' + DIP_MIN + ' всего ' + withDip.length + ', нужно ' +
    MIN_DIP_FORMS + '. Плотным центром провал не делается: нужен именно пустой промежуток ' +
    'между ядром и кольцом. Это признак 10 референса, в каталоге таких форм нет ни одной.');
}

// 4. Признак 11: честно пустая середина.
const hollow = rows.filter(r => r.core < CORE_EMPTY);
console.log('с пустой серединой (центр < ' + CORE_EMPTY + '): ' + hollow.length +
  ' (нужно не меньше ' + MIN_HOLLOW_FORMS + ')');
if (hollow.length < MIN_HOLLOW_FORMS) {
  bad('форм с честно пустой серединой всего ' + hollow.length + ', нужно ' +
    MIN_HOLLOW_FORMS + '. Это признак 11 референса: свет только по краям.');
}

// 5. Разнообразие набора. Двадцать шаровых слоёв с разными параметрами и красивыми именами
// проходят все числа выше: метрики у них честные. Отличает их разброс УГЛОВОЙ структуры —
// доля точек по 32 секторам направления. У шарового слоя точки лежат по всем направлениям
// ровно, у узла, мозаики, губки, решётки — нет. Замеры: каталог из 35 форм даёт разброс
// от 0.208 до 3.252, то есть в 15.6 раза; эталон — в 5.98; набор из двадцати трёх оболочек
// с именами бутылки Клейна и трилистника — в 2.35. Порог 3.0 оставляет эталону запас вдвое.
//
// Чего эта проверка НЕ делает: она не подтверждает, что форма по имени kleinBottle —
// действительно бутылка Клейна. Механически это не проверяется, и последнее слово тут
// за проверяющим, который смотрит на кадры. Гейт ловит другое: набор, собранный одним
// приёмом с разными подписями.
const SPREAD_MIN = 3.0;
function angularSpread(fn) {
  const AZ = 8, EL = 4;
  const b = new Array(AZ * EL).fill(0);
  const out = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    out[0] = 0; out[1] = 0; out[2] = 0;
    fn(i, P, out);
    const r = Math.hypot(out[0], out[1], out[2]);
    if (!Number.isFinite(r) || r < 1e-9) continue;
    const az = Math.floor(((Math.atan2(out[2], out[0]) + Math.PI) / (2 * Math.PI)) * AZ) % AZ;
    const el = Math.min(EL - 1, Math.floor(((out[1] / r) * 0.5 + 0.5) * EL));
    b[el * AZ + az]++;
  }
  const mean = b.reduce((a, c) => a + c, 0) / b.length;
  if (mean <= 0) return 0;
  return Math.sqrt(b.reduce((s, v) => s + (v - mean) ** 2, 0) / b.length) / mean;
}
if (rows.length) {
  const anis = shapeList
    .filter(([k]) => rows.some(r => r.key === k))
    .map(([k, fn]) => [k, angularSpread(fn)])
    .sort((a, b) => a[1] - b[1]);
  const spread = anis[0][1] > 0 ? anis[anis.length - 1][1] / anis[0][1] : 0;
  console.log('');
  console.log('угловая структура: от ' + anis[0][1].toFixed(3) + ' (' + anis[0][0] + ') до ' +
    anis[anis.length - 1][1].toFixed(3) + ' (' + anis[anis.length - 1][0] + '), разброс в ' +
    spread.toFixed(2) + ' раза (нужно не меньше ' + SPREAD_MIN + ')');
  if (spread < SPREAD_MIN) {
    bad('набор собран одним приёмом: разброс угловой структуры всего ' + spread.toFixed(2) +
      ' при пороге ' + SPREAD_MIN + '. У каталога из 35 форм он 15.6. Так выглядит набор, ' +
      'где все формы — шаровые слои с разными параметрами, а имена математических тел ' +
      'приписаны сверху. Узел, мозаика, губка и решётка не раскладывают точки ровно по ' +
      'всем направлениям — в этом и разница.');
  }
}

// 6. Имена: набор обязан быть математическим, а не двадцатью безымянными оболочками.
// Числа гейта проходит и скучный набор шаровых слоёв — метрики у него честные. Поэтому
// отдельно считается, сколько форм названы вещами из списка задачи: топология, фракталы,
// апериодика. На эталоне эта проверка пропускается намеренно — он для арифметики, а не
// образец содержания, и своими именами прикидываться бутылкой Клейна не должен.
const MATH_NAMES = /klein|mobius|moebius|boy|roman|trefoil|knot|lissajous|hopf|clifford|catenoid|helicoid|enneper|gyroid|schwarz|calabi|menger|sierpinski|apollon|kleinian|mandel|julia|hilbert|peano|thomas|lorenz|rossler|cantor|penrose|ammann|quasicrystal|poincare|hyperbol|fibonacci|voronoi|torus/i;
const MIN_MATH_NAMES = 8;
if (!LOCAL.startsWith('tools/')) {
  const named = rows.filter(r => MATH_NAMES.test(r.key));
  console.log('');
  console.log('форм с математическими именами: ' + named.length + ' (нужно не меньше ' +
    MIN_MATH_NAMES + ')' + (named.length ? ' — ' + named.map(r => r.key).join(' ') : ''));
  if (named.length < MIN_MATH_NAMES) {
    bad('математически названных форм всего ' + named.length + ', нужно ' + MIN_MATH_NAMES +
      '. Задача просит топологию, фракталы и апериодику — бутылку Клейна, ленту Мёбиуса, ' +
      'узлы, губку Менгера, мозаику Пенроуза. Двадцать безымянных шаровых слоёв проходят ' +
      'числа гейта и не дают того, за чем задача заведена.');
  }
}

// 7. Близнецы — между новыми формами и против каталога.
const CATALOG = 'src/world/shapeCatalog.js';
let catalogRows = [];
if (fs.existsSync(CATALOG)) {
  try {
    const cat = await import(pathToFileURL(path.resolve(CATALOG)).href);
    const keys = cat.SHAPE_KEYS || Object.keys(cat.SHAPES || {});
    for (const k of keys) {
      const m = measure(cat.SHAPES[k]);
      if (!m.bad) catalogRows.push({ key: 'каталог:' + k, ...m });
    }
  } catch (e) {
    console.log('каталог не импортируется, сверку с ним пропускаю: ' + e.message);
  }
}
const l1 = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);
let worst = { d: Infinity, pair: '' };
const all = rows.concat(catalogRows);
for (let i = 0; i < rows.length; i++) {
  for (let j = 0; j < all.length; j++) {
    if (all[j].key === rows[i].key) continue;
    const d = l1(rows[i].profile, all[j].profile);
    if (d < worst.d) worst = { d, pair: rows[i].key + ' и ' + all[j].key };
  }
}
console.log('');
console.log('ближайшая пара профилей: ' + worst.pair + ', расстояние ' + worst.d.toFixed(3) +
  ' (нужно не меньше ' + TWIN_MIN + '), сверено против каталога: ' + catalogRows.length + ' форм');
if (worst.d < TWIN_MIN) {
  bad('две формы дают один радиальный профиль: ' + worst.pair + ', расстояние ' +
    worst.d.toFixed(3) + ' при пороге ' + TWIN_MIN + '. Это близнецы: одна форма, ' +
    'посчитанная дважды, за две не идёт.');
}

// 6. Отклик на радиус и детерминизм.
if (rows.length) {
  const [key, fn] = shapeList.find(([k]) => k === rows[0].key);
  const small = measure(fn, { ...P, radius: P.radius });
  const large = measure(fn, { ...P, radius: P.radius * 2 });
  if (!small.bad && !large.bad && small.span > 0) {
    const ratio = large.span / small.span;
    console.log('отклик на радиус (x2) у формы ' + key + ': ' + ratio.toFixed(3) +
      ' (нужно в полосе ' + SCALE_MIN + '…' + SCALE_MAX + ')');
    if (ratio < SCALE_MIN || ratio > SCALE_MAX) {
      bad('форма ' + key + ' не слушает p.radius: удвоение меняет габарит в ' +
        ratio.toFixed(3) + ' раз. В мире она приедет чужого размера.');
    }
  }
  const again = measure(fn);
  console.log('тот же вызов даёт те же точки: ' + (again.hash === rows[0].hash));
  if (again.hash !== rows[0].hash) {
    bad('форма ' + key + ': два вызова с теми же аргументами дали разные точки — нарушено ' +
      'правило 7. Обычно Math.random внутри.');
  }
}

console.log('');
if (problems.length) {
  for (const p of problems) console.error('  x ' + p);
  console.error('');
  console.error('ILLUSION_FAIL');
  process.exit(1);
}
console.log('ILLUSION_OK');
