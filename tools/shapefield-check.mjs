// Проверка тонкого слоя форм: он действительно зовёт каталог, слушает число точек и
// габарит, и разным полям `shape` сида даёт разные облака.
//
//   node tools/shapefield-check.mjs
//   node tools/shapefield-check.mjs --mod tools/fixture-shapefield.js
//   node tools/shapefield-check.mjs --mutate onecount
//
// Зачем: у N27 проверкой был `node tools/shape-check.mjs` — он мерит КАТАЛОГ, восстановленный
// из истории, и про новый `shapeField.js` не знает ничего. То же сочетание, которым в этом
// проекте уже закрывалась неработающая задача: модуль, который никто не импортирует до
// поздней задачи, и проверка, мерящая что-то рядом. Тут проверяется сам слой: его зовут
// руками и смотрят на точки, которые он выдаёт.
//
// Браузер не нужен: слой — чистая арифметика над колбэком fill(i, out).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const rawMod = arg('mod', 'src/world/shapeField.js').split('\\').join('/');
const LOCAL = (rawMod.match(/(?:tools|src)\/.*/) || [rawMod.replace(/^\//, '')])[0];
const MUTATE = arg('mutate', '');

// Пороги. Замеры на эталоне печатаются рядом с каждым.
const PROBE_COUNT = 600;      // точек на облако при обходе всех 64 форм
const MIN_SPAN = 1e-6;        // габарит облака обязан быть больше нуля
// Разные значения shape обязаны давать разные облака. Абсолютное число тут ставить
// некуда: у эталона восемь форм, у настоящего каталога 64, и порог «не меньше восьми»
// стоял бы ровно на замере эталона, без запаса. Поэтому спрашивается два: имён форм
// не меньше MIN_KEYS (эталон даёт 8, каталог 64), и каждое имя даёт своё облако —
// это же ловит близнецов, когда две формы оказываются одной, вызванной дважды.
const MIN_KEYS = 4;
const MIN_DISTINCT = 4;       // запас на случай, если слой не отдаёт имя формы
// Отклик на габарит: удвоил extent — обязан удвоиться размер облака. Полоса 1.6…2.4
// вместо точной двойки, потому что у форм с дискретной решёткой габарит скачет на
// округлении. На эталоне все восемь форм дают ровно 2.000.
const SCALE_MIN = 1.6;
const SCALE_MAX = 2.4;
// Доля точек, попавших в одну ячейку сетки 8x8x8: выше — облако выродилось в комок.
// На эталоне худшая форма (cubeLattice) даёт 0.125, у настоящего каталога формы
// разнообразнее. Порог 0.60 ловит вырождение, а не плотное ядро.
const MAX_CLUMP = 0.60;
// Габарит формы не должен зависеть от того, сколько точек мы попросили: 200 точек — то же
// облако, только реже. Полоса заполняется по замеру эталона, см. прогон ниже.
const COUNT_SPAN_MIN = Number(arg('count-span-min', '0.7'));
const COUNT_SPAN_MAX = Number(arg('count-span-max', '1.4'));

if (!fs.existsSync(LOCAL)) {
  console.error(LOCAL + ' не найден');
  console.error('SHAPEFIELD_FAIL');
  process.exit(1);
}

const problems = [];
const bad = (m) => problems.push(m);

let mod;
try {
  mod = await import(pathToFileURL(path.resolve(LOCAL)).href);
} catch (e) {
  console.error('модуль не импортируется: ' + (e && e.message));
  console.error('SHAPEFIELD_FAIL');
  process.exit(1);
}

if (typeof mod.buildShapeField !== 'function') {
  console.error('нет экспорта buildShapeField(fields, opts) — проверять нечего');
  console.error('SHAPEFIELD_FAIL');
  process.exit(1);
}

// Мутации: правдоподобные способы сдать слой так, чтобы он не работал. Ломается не файл,
// а обёртка вокруг импортированного модуля — гейт обязан краснеть на каждой.
const MUTATIONS = {
  onecount: 'число точек игнорируется, всегда 6000',
  oneshape: 'форма всегда одна, поле shape не читается',
  noextent: 'габарит игнорируется, extent ни на что не влияет',
  nan: 'каждая тысячная точка выходит NaN',
  flat: 'все точки в начале координат',
  nondet: 'точки зависят от Math.random',
};
if (MUTATE && !MUTATIONS[MUTATE]) {
  console.error('нет такой мутации: ' + MUTATE + '. Есть: ' + Object.keys(MUTATIONS).join(', '));
  process.exit(1);
}

const buildRaw = mod.buildShapeField;
const build = (fields, opts = {}) => {
  const o = { ...opts };
  const f = { ...fields };
  if (MUTATE === 'onecount') o.count = 6000;
  if (MUTATE === 'oneshape') f.shape = 0;
  if (MUTATE === 'noextent') o.extent = 400;
  const got = buildRaw(f, o);
  if (!got || typeof got.fill !== 'function') return got;
  const fill = got.fill.bind(got);
  return {
    ...got,
    count: MUTATE === 'onecount' ? (opts.count ?? got.count) : got.count,
    fill(i, out) {
      fill(i, out);
      if (MUTATE === 'nan' && i % 1000 === 0) out[0] = NaN;
      if (MUTATE === 'flat') { out[0] = 0; out[1] = 0; out[2] = 0; }
      if (MUTATE === 'nondet') out[0] += Math.random();
    },
  };
};

if (MUTATE) console.log('мутация: ' + MUTATE + ' — ' + MUTATIONS[MUTATE]);
console.log('модуль: ' + LOCAL);

function cloud(field, count) {
  const pts = new Float64Array(count * 3);
  const out = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    out[0] = 0; out[1] = 0; out[2] = 0;
    field.fill(i, out);
    if (!Number.isFinite(out[0]) || !Number.isFinite(out[1]) || !Number.isFinite(out[2])) {
      return { bad: 'не число на точке ' + i + ': ' + out.join(', ') };
    }
    pts[i * 3] = out[0]; pts[i * 3 + 1] = out[1]; pts[i * 3 + 2] = out[2];
  }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let d = 0; d < 3; d++) {
      const v = pts[i * 3 + d];
      if (v < mn[d]) mn[d] = v;
      if (v > mx[d]) mx[d] = v;
    }
  }
  const span = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  // Комок: доля точек в самой населённой ячейке сетки 8x8x8 по габариту облака.
  const G = 8, cells = new Map();
  for (let i = 0; i < count; i++) {
    let idx = 0;
    for (let d = 0; d < 3; d++) {
      const s = (mx[d] - mn[d]) || 1;
      idx = idx * G + Math.min(G - 1, Math.floor((pts[i * 3 + d] - mn[d]) / s * G));
    }
    cells.set(idx, (cells.get(idx) || 0) + 1);
  }
  const clump = Math.max(...cells.values()) / count;
  // Подпись облака: хеш округлённых координат. Нужна, чтобы сравнивать облака между собой.
  let h = 2166136261;
  for (let i = 0; i < count * 3; i++) {
    h ^= Math.round(pts[i] * 100) | 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return { span, spanAxis: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], clump, hash: h, pts };
}

const seed = (shape) => ({
  structure: 3, palette: 2, mood: 1, density: 9, fractal: 4,
  motion: 2, nonEuclid: 1, music: 7, shape, exit: 130,
});

// 1. Все 64 значения поля shape обязаны отработать. Поле шестибитное, других значений
// из decodeSeed не придёт.
const clouds = [];
let firstFail = null;
for (let shape = 0; shape < 64; shape++) {
  let field;
  try {
    field = build(seed(shape), { count: PROBE_COUNT, extent: 400 });
  } catch (e) {
    if (!firstFail) firstFail = 'buildShapeField падает на shape=' + shape + ': ' + e.message;
    continue;
  }
  if (!field || typeof field.fill !== 'function') {
    if (!firstFail) firstFail = 'buildShapeField при shape=' + shape + ' вернул объект без fill(i, out)';
    continue;
  }
  const c = cloud(field, PROBE_COUNT);
  if (c.bad) {
    if (!firstFail) firstFail = 'форма при shape=' + shape + ' (' + (field.key || '?') + ') даёт ' + c.bad;
    continue;
  }
  clouds.push({ shape, key: field.key, count: field.count, ...c });
}
if (firstFail) bad(firstFail);
console.log('значений поля shape пройдено: ' + clouds.length + ' из 64');

if (!clouds.length) {
  console.error('');
  for (const p of problems) console.error('  x ' + p);
  console.error('');
  console.error('SHAPEFIELD_FAIL');
  process.exit(1);
}

// 2. Габарит больше нуля и облако не выродилось в комок.
const worstSpan = Math.min(...clouds.map(c => c.span));
const worstClump = Math.max(...clouds.map(c => c.clump));
const worstClumpKey = clouds.find(c => c.clump === worstClump);
console.log('худший габарит облака: ' + worstSpan.toFixed(3) + ' (нужно больше ' + MIN_SPAN + ')');
console.log('худший комок: ' + worstClump.toFixed(3) + ' у формы ' +
  (worstClumpKey ? (worstClumpKey.key || 'shape=' + worstClumpKey.shape) : '?') +
  ' (допуск ' + MAX_CLUMP + ')');
if (!(worstSpan > MIN_SPAN)) {
  bad('есть форма с нулевым габаритом: все её точки в одной координате. Обычно это значит, ' +
    'что форму позвали, но её параметры пришли пустыми.');
}
if (worstClump > MAX_CLUMP) {
  bad('облако выродилось в комок: ' + (worstClump * 100).toFixed(1) + '% точек в одной ячейке ' +
    'сетки 8x8x8 при допуске ' + (MAX_CLUMP * 100) + '%. На экране это одна точка, а не форма.');
}

// 3. Разным значениям shape — разные облака. Иначе слой всегда берёт одну форму.
const distinct = new Set(clouds.map(c => c.hash)).size;
const keys = new Set(clouds.map(c => c.key).filter(Boolean)).size;
console.log('разных облаков на 64 значениях shape: ' + distinct + ', разных имён форм: ' +
  (keys || 'имя не отдаётся') + ' (нужно имён не меньше ' + MIN_KEYS +
  ' и по своему облаку на каждое имя)');
if (keys) {
  if (keys < MIN_KEYS) {
    bad('слой берёт из каталога всего ' + keys + ' форм(ы) на 64 значениях поля shape: ' +
      'остальные недостижимы ни при каком сиде. Обычно это остаток от деления на неверную длину.');
  }
  if (distinct < keys) {
    bad('имён форм ' + keys + ', а разных облаков только ' + distinct + ': какие-то две формы ' +
      'дают побайтово одно и то же облако. Так уже было у раскладок — ID 7 оказался ID 1, ' +
      'вызванным дважды.');
  }
} else if (distinct < MIN_DISTINCT) {
  bad('на 64 значениях поля shape получилось всего ' + distinct + ' разных облаков: слой ' +
    'берёт из каталога одну и ту же форму. Обычно это остаток от деления на неверную длину.');
}

// 4. Число точек: сколько попросили, столько и обязано быть — и число обязано дойти до
// самой формы. Формы раскладывают точки по i/count, поэтому слой, который просит форму
// на 6000 точках, а заполняет 200, отдаёт не форму, а её обрезанный ломтик: габарит
// облака схлопывается. Одного сравнения `field.count === want` тут мало — оно проходит
// и у слоя, который принял число, отчитался им и в форму передал своё.
const spans = {};
for (const want of [200, 3000]) {
  const field = build(seed(5), { count: want, extent: 400 });
  if (!field || typeof field.fill !== 'function') { bad('buildShapeField не отдал fill при count=' + want); continue; }
  if (field.count !== want) {
    bad('попросили ' + want + ' точек, а слой отдал count=' + field.count +
      '. buildFieldGeometry строит буфер ровно на count точек, поэтому лишние точки в кадр ' +
      'не попадут, а недостающие останутся нулями.');
  }
  const c = cloud(field, want);
  if (c.bad) { bad('при count=' + want + ' форма даёт ' + c.bad); continue; }
  spans[want] = c;
}
// Мерить по всему габаритному боксу тут нельзя: у формы из двух лепестков обрезанный
// ломтик всё ещё широк по X и Z, и отношение выходило 0.706 при пороге 0.7 — мутация
// проходила по краю. Ломтик виден по ОСЯМ: срез берёт узкую полосу параметра, и по одной
// оси габарит схлопывается в проценты. Оси, у которых форма и так плоская (габарит меньше
// 5% от наибольшего), из сравнения выкидываются — там отношение считалось бы по шуму.
if (spans[200] && spans[3000]) {
  const big = spans[3000], small = spans[200];
  const worstAxis = ['X', 'Y', 'Z']
    .map((name, d) => ({ name, ratio: small.spanAxis[d] / (big.spanAxis[d] || 1), big: big.spanAxis[d] }))
    .filter(a => a.big > big.span * 0.05)
    .reduce((w, a) => (a.ratio < w.ratio ? a : w), { name: '—', ratio: Infinity, big: 0 });
  console.log('габарит формы при 200 и при 3000 точках, худшая ось ' + worstAxis.name + ': ' +
    'отношение ' + worstAxis.ratio.toFixed(3) + ' (нужно в полосе ' + COUNT_SPAN_MIN + '…' +
    COUNT_SPAN_MAX + ')');
  if (worstAxis.ratio < COUNT_SPAN_MIN || worstAxis.ratio > COUNT_SPAN_MAX) {
    bad('форма при 200 точках занимает не тот объём, что при 3000: по оси ' + worstAxis.name +
      ' отношение габаритов ' + worstAxis.ratio.toFixed(3) + ' при полосе ' + COUNT_SPAN_MIN +
      '…' + COUNT_SPAN_MAX + '. Обычно это значит, что число точек до формы не доходит: ' +
      'форму зовут на своём числе, а заполняют столько, сколько попросили, и в кадр ' +
      'приезжает ломтик формы.');
  }
}

// 5. Отклик на габарит: удвоил extent — обязан удвоиться размер облака. Попадание в
// полосу без отклика уже случалось у раскладок: фиксированный габарит проходил допуск
// и при 200, и при 400.
const scales = [];
for (const shape of [0, 1, 2, 3, 5, 8, 13, 21]) {
  const small = build(seed(shape), { count: PROBE_COUNT, extent: 200 });
  const large = build(seed(shape), { count: PROBE_COUNT, extent: 400 });
  if (!small || !large || typeof small.fill !== 'function' || typeof large.fill !== 'function') continue;
  const a = cloud(small, PROBE_COUNT), b = cloud(large, PROBE_COUNT);
  if (a.bad || b.bad) continue;
  if (a.span > 0) scales.push({ shape, key: large.key, ratio: b.span / a.span });
}
if (scales.length) {
  const worst = scales.reduce((w, s) =>
    (Math.abs(s.ratio - 2) > Math.abs(w.ratio - 2) ? s : w), scales[0]);
  console.log('отклик на габарит (extent 200 → 400): худший ' + worst.ratio.toFixed(3) +
    ' у формы ' + (worst.key || 'shape=' + worst.shape) + ', нужно в полосе ' +
    SCALE_MIN + '…' + SCALE_MAX);
  if (worst.ratio < SCALE_MIN || worst.ratio > SCALE_MAX) {
    bad('форма ' + (worst.key || 'shape=' + worst.shape) + ' не слушает габарит: удвоение ' +
      'extent меняет размер облака в ' + worst.ratio.toFixed(3) + ' раз при полосе ' +
      SCALE_MIN + '…' + SCALE_MAX + '. Мир радиусом 400 получит форму чужого размера.');
  }
} else {
  bad('отклик на габарит замерить не удалось: ни одна форма не отработала на двух значениях extent');
}

// 6. Детерминизм: правило 7 проекта. Тот же сид — те же точки.
const d1 = cloud(build(seed(11), { count: 500, extent: 400 }), 500);
const d2 = cloud(build(seed(11), { count: 500, extent: 400 }), 500);
const same = !d1.bad && !d2.bad && d1.hash === d2.hash;
console.log('тот же сид даёт те же точки: ' + same);
if (!same) {
  bad('два вызова с одним сидом дали разные облака — нарушено правило 7. Обычно причина ' +
    'в Math.random или Date.now внутри формы либо в общем изменяемом состоянии слоя.');
}

// 7. Имена форм обязаны быть именами каталога или нового набора: слой — тонкий слой над
// ними, а не собственный склад форм.
//
// Новый набор тут появился не сразу: N63 просит брать формы из объединения
// { ...SHAPES, ...ILLUSION_SHAPES }, а сверка знала только каталог — и объявляла чужими
// ровно те формы, которые задача просила добавить. На этом N63 и встала, правильно.
// На эталоне сверка имён пропускается: у него свой встроенный набор из восьми форм, он
// существует для арифметики контракта, а не как источник форм мира. Пока каталога в проекте
// не было, эта ветка молчала сама, и расхождение не вылезало.
const CATALOG = 'src/world/shapeCatalog.js';
const EXTRA = 'src/world/shapeIllusions.js';
if (fs.existsSync(CATALOG) && keys && !LOCAL.startsWith('tools/')) {
  try {
    const cat = await import(pathToFileURL(path.resolve(CATALOG)).href);
    const known = new Set(cat.SHAPE_KEYS || Object.keys(cat.SHAPES || {}));
    const fromCatalog = known.size;
    let fromExtra = 0;
    if (fs.existsSync(EXTRA)) {
      try {
        const ill = await import(pathToFileURL(path.resolve(EXTRA)).href);
        const extraKeys = Object.keys(ill.ILLUSION_SHAPES || ill.SHAPES || {});
        fromExtra = extraKeys.length;
        for (const k of extraKeys) known.add(k);
      } catch (e) {
        console.log('новый набор форм не импортируется: ' + e.message);
      }
    }
    console.log('форм, которые слой вправе отдавать: ' + known.size +
      ' (каталог ' + fromCatalog + ', новый набор ' + fromExtra + ')');
    const alien = [...new Set(clouds.map(c => c.key).filter(Boolean))].filter(k => !known.has(k));
    if (known.size && alien.length) {
      bad('слой отдаёт формы, которых нет ни в каталоге, ни в новом наборе: ' +
        alien.slice(0, 5).join(', ') + '. Источник форм — эти два файла, свои формы в слое ' +
        'не нужны.');
    }
  } catch (e) {
    console.log('каталог не импортируется, сверку имён пропускаю: ' + e.message);
  }
}

if (problems.length) {
  console.error('');
  for (const p of problems) console.error('  x ' + p);
  console.error('');
  console.error('SHAPEFIELD_FAIL');
  process.exit(1);
}
console.log('SHAPEFIELD_OK');
