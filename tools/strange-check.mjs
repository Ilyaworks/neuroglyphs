// Проверяет набор причудливых форм: src/world/shapeStrange.js.
//
//   node tools/strange-check.mjs
//   node tools/strange-check.mjs --mod tools/fixture-strange.js
//   node tools/strange-check.mjs --self
//
// Зачем. Набор форм — то место, где проект уже дважды обжигался. R25 закрылась с
// семью одинаковыми формами на контактном листе, R26 — с восемью, которые «различались
// углами, а силуэт читался радиусом». Счёт экспортов и длины массива это пропускают:
// двенадцать имён при одном рисунке проходят такую проверку молча.
//
// Здесь мерятся два свойства, и оба именно те, на которых обжигались:
//
//   1. каждая форма читается ОДНИМ предметом, а не россыпью — доля точек в самом
//      большом связном сгустке;
//   2. никакая пара форм не похожа ближе порога — отпечаток силуэта по семи признакам.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { selfTest, freshUrl } from './gate-selftest.mjs';

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > -1 ? process.argv[i + 1] : d;
};
const quiet = process.argv.includes('--quiet');
const say = (m) => { if (!quiet) console.log(m); };

const MIN_FORMS = 10;
const ONE_OBJECT = 0.55;   // доля точек в главном сгустке
const PAIR_MIN = 0.16;     // насколько два силуэта обязаны расходиться
const GRID = 8;            // сетка для поиска связного сгустка

function cloudOf(form) {
  const out = [0, 0, 0];
  const xs = [], ys = [], zs = [];
  for (let i = 0; i < form.count; i++) {
    form.fill(i, out);
    if (!Number.isFinite(out[0]) || !Number.isFinite(out[1]) || !Number.isFinite(out[2])) return null;
    xs.push(out[0]); ys.push(out[1]); zs.push(out[2]);
  }
  return { xs, ys, zs, n: xs.length };
}

// Доля точек в самом большом связном сгустке. Форма, рассыпавшаяся на куски, читается
// россыпью, а не предметом, — и это ровно то, что человек говорил про невозможную
// фигуру на R27: «только скопление символов, а не цельная фигура».
const NEIGH = [];
for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
  if (dx || dy || dz) NEIGH.push([dx, dy, dz]);
}

function mainClusterShare(c) {
  const lo = [Math.min(...c.xs), Math.min(...c.ys), Math.min(...c.zs)];
  const hi = [Math.max(...c.xs), Math.max(...c.ys), Math.max(...c.zs)];
  // Ячейка КУБИЧЕСКАЯ: сторона считается по самому длинному габариту и одна на все оси.
  // Нормировка по каждой оси отдельно давала у плоской формы абсурдно мелкий шаг по
  // высоте: циферблат из шести колец, лежащих почти в одной плоскости, распадался на
  // шесть кусков, и гейт объявлял россыпью то, что глазом читается одной вещью.
  const span = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const cell = Math.max(1e-6, Math.max(span[0], span[1], span[2]) / GRID);
  const cells = new Map();
  for (let i = 0; i < c.n; i++) {
    const gx = Math.floor((c.xs[i] - lo[0]) / cell);
    const gy = Math.floor((c.ys[i] - lo[1]) / cell);
    const gz = Math.floor((c.zs[i] - lo[2]) / cell);
    const key = gx + ':' + gy + ':' + gz;
    cells.set(key, (cells.get(key) || 0) + 1);
  }
  const seen = new Set();
  let best = 0;
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    let sum = 0;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const k = stack.pop();
      sum += cells.get(k) || 0;
      const [x, y, z] = k.split(':').map(Number);
      // Соседство по всем 26 направлениям, а не по шести. По шести концентрические
      // кольца часов и витки лестницы Пенроуза распадались на отдельные куски, и гейт
      // объявлял россыпью то, что глазом читается одной вещью. Самопроверка поймала.
      for (const [dx, dy, dz] of NEIGH) {
        const nk = (x + dx) + ':' + (y + dy) + ':' + (z + dz);
        if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    if (sum > best) best = sum;
  }
  return best / c.n;
}

// Отпечаток силуэта. Семь чисел, по которым две формы либо разные, либо близнецы.
function printOf(c) {
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(c.xs), my = mean(c.ys), mz = mean(c.zs);
  const span = (a) => Math.max(...a) - Math.min(...a);
  const sx = Math.max(1e-6, span(c.xs)), sy = Math.max(1e-6, span(c.ys)), sz = Math.max(1e-6, span(c.zs));
  const big = Math.max(sx, sy, sz);

  const rs = [];
  for (let i = 0; i < c.n; i++) {
    rs.push(Math.hypot(c.xs[i] - mx, c.ys[i] - my, c.zs[i] - mz));
  }
  const rmax = Math.max(...rs, 1e-6);
  let core = 0, shell = 0;
  for (const r of rs) {
    if (r < rmax * 0.3) core++;
    if (r > rmax * 0.75) shell++;
  }
  // Заполненность габарита: сколько ячеек сетки заняты.
  const occ = new Set();
  for (let i = 0; i < c.n; i++) {
    occ.add(Math.round(((c.xs[i] - mx) / big) * 8) + ':'
      + Math.round(((c.ys[i] - my) / big) * 8) + ':'
      + Math.round(((c.zs[i] - mz) / big) * 8));
  }
  // Полая ли форма по горизонтали. Без этого признака водопад и обелиск оказывались
  // близнецами: оба «вертикальный столб плюс осыпь внизу». А по существу они разные —
  // у водопада струя сплошная, у обелиска грани полые, внутри пусто. Именно так и
  // отличают колонну от потока глазом.
  const hs = [];
  for (let i = 0; i < c.n; i++) hs.push(Math.hypot(c.xs[i] - mx, c.zs[i] - mz));
  const hmax = Math.max(...hs, 1e-6);
  let hcore = 0;
  for (const h of hs) if (h < hmax * 0.3) hcore++;

  // Разброс высоты относительно ширины и глубины — плоские формы отличаются здесь.
  return [
    sy / big, sz / big,
    core / c.n, shell / c.n,
    occ.size / c.n,
    mean(rs) / rmax,
    Math.min(1, span(c.ys) / (span(c.xs) + 1e-6)),
    hcore / c.n,
  ];
}

async function runOnce(modPath) {
  const problems = [];
  const bad = (m) => problems.push(m);

  const abs = path.resolve(modPath);
  if (!fs.existsSync(abs)) {
    return ['модуль не загрузился: нет файла ' + modPath + ' — именно это `node --check` и не видит'];
  }
  let mod;
  try { mod = await import(freshUrl(pathToFileURL(abs).href)); }
  catch (e) { return ['модуль не загрузился: ' + e.message + ' — именно это `node --check` и не видит']; }
  if (typeof mod.buildStrange !== 'function') return ['нет buildStrange(name, seed, opts)'];

  const listRaw = mod.STRANGE_FORMS;
  const list = typeof listRaw === 'function' ? listRaw() : listRaw;
  if (!Array.isArray(list)) return ['нет списка STRANGE_FORMS'];

  say('форм в наборе: ' + list.length);
  if (list.length < MIN_FORMS) {
    bad('форм всего ' + list.length + ', нужно не меньше ' + MIN_FORMS);
  }

  const prints = {};
  for (const name of list) {
    let form;
    try { form = mod.buildStrange(name, 'TEST-TEST-TEST', {}); }
    catch (e) { bad(name + ': buildStrange упал: ' + e.message); continue; }
    if (!form || !form.count || typeof form.fill !== 'function') { bad(name + ': пустая форма'); continue; }
    const c = cloudOf(form);
    if (!c) { bad(name + ': среди координат есть не-числа'); continue; }

    const share = mainClusterShare(c);
    if (share < ONE_OBJECT) {
      bad(name + ': не читается одним предметом — в главном сгустке всего '
        + (share * 100).toFixed(0) + '% точек при пороге ' + (ONE_OBJECT * 100)
        + '%. Это россыпь, а не вещь');
    }
    prints[name] = printOf(c);
  }

  // Попарное сравнение силуэтов: тот же приём, которым ловили близнецов на R25 и R26.
  const names = Object.keys(prints);
  let worst = { a: '', b: '', d: 9 };
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const A = prints[names[i]], B = prints[names[j]];
      let d = 0;
      for (let k = 0; k < A.length; k++) d += (A[k] - B[k]) * (A[k] - B[k]);
      d = Math.sqrt(d);
      if (d < worst.d) worst = { a: names[i], b: names[j], d };
    }
  }
  if (names.length > 1) {
    say('ближайшая пара форм: ' + worst.a + ' и ' + worst.b + ', расхождение '
      + worst.d.toFixed(3) + ' (нужно ' + PAIR_MIN + ')');
    if (worst.d < PAIR_MIN) {
      bad('формы ' + worst.a + ' и ' + worst.b + ' — близнецы: силуэты расходятся всего на '
        + worst.d.toFixed(3) + ' при пороге ' + PAIR_MIN + '. Именно так закрылась R25 с '
        + 'семью одинаковыми формами на листе');
    }
  }

  // Детерминизм проверяется всегда, а не только когда всё чисто.
  {
    try {
      const dump = (seed) => {
        const f = mod.buildStrange(list[0], seed, {});
        const c = cloudOf(f);
        return c ? c.xs.slice(0, 50).join(',') + '|' + c.ys.slice(0, 50).join(',') : 'null';
      };
      const a = dump('SEED-AAAA-1111');
      const b = dump('SEED-AAAA-1111');
      const c = dump('SEED-BBBB-2222');
      say('тот же сид даёт ту же форму: ' + (a === b));
      if (a !== b) bad('тот же сид даёт другую форму — нарушен инвариант 1');
      if (a === c) bad('другой сид даёт ту же форму — сид ни на что не влияет');
    } catch (e) {
      bad('проверка детерминизма упала: ' + e.message);
    }
  }

  return problems;
}

const MUTATIONS = [
  ['twins', 'все формы рисуются одинаково', 'близнецы'],
  ['scatter', 'форма рассыпается в россыпь', 'не читается одним предметом'],
  ['few', 'форм меньше десяти', 'форм всего'],
  ['flat', 'все формы вырождаются в плоскость', 'близнецы'],
  ['random', 'Math.random вместо сеяного PRNG', 'тот же сид'],
];

if (process.argv.includes('--self')) {
  process.exit(await selfTest({
    title: 'strange-check — причудливые формы',
    fixture: 'tools/fixture-strange.js',
    mutations: MUTATIONS,
    runOnce,
  }));
} else {
  const problems = await runOnce(arg('mod', 'src/world/shapeStrange.js'));
  if (problems.length) {
    console.log('');
    for (const p of problems) console.log('  x ' + p);
    console.log('');
    console.log('STRANGE_FAIL');
    process.exit(1);
  }
  console.log('STRANGE_OK');
}
