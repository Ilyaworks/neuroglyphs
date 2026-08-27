// Проверяет модули поверхностей: src/world/surface.js и src/world/marks.js.
//
//   node tools/surface-check.mjs
//   node tools/surface-check.mjs --mod tools/fixture-surface.js
//   node tools/surface-check.mjs --self          самопроверка: эталон и все порчи
//
// Зачем именно так. Признак 27 референса — символы ЛЕЖАТ НА ПОВЕРХНОСТЯХ. Проверка
// вида «модуль есть и экспортирует две функции» его не стережёт: её проходит модуль,
// который раскидывает точки по объёму, заливает знаки сплошняком и делает все девять
// родов одинаковыми. Каждый из этих трёх способов сдать задачу неработающей в проекте
// уже случался — на N09, R13 и R25. Поэтому здесь мерятся свойства результата:
//
//   1. точки лежат в тонком слое НА поверхности, а не в объёме вокруг неё;
//   2. у каждой точки своя нормаль, и на кривой поверхности нормали разные;
//   3. знаки-обводки внутри ПУСТЫЕ — залитый знак читается пятном и убивает сходство;
//   4. девять родов знаков различимы замером, а не только именами;
//   5. на одной поверхности живут не меньше трёх масштабов с разбросом не меньше 20 —
//      именно из иерархии масштабов берётся «наполненность деталями»;
//   6. всё детерминировано по сиду.
//
// Гейт сам проверяется: `--self` прогоняет эталон tools/fixture-surface.js и шесть
// порч. Эталон обязан пройти, каждая порча — упасть. Гейт, который не кусается,
// ничего не охраняет.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const NL = String.fromCharCode(10);
const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > -1 ? process.argv[i + 1] : d;
};

const KINDS = ['emblem', 'string', 'formula', 'panel', 'edge', 'rosette', 'lattice', 'pattern', 'marking'];
// Пустотелость мерится только у ЗАМКНУТЫХ знаков. У линии (edge, marking, string,
// formula) середина занята по определению, и требовать от неё пустоты — мерить не то.
// Самопроверка гейта поймала это на первом же прогоне: линейные роды валили эталон,
// и из-за ложной ошибки порчи падали не по своей причине.
const HOLLOW = ['emblem', 'panel', 'rosette'];
const LINEAR = ['edge', 'marking', 'string', 'formula'];
const LINEAR_MIN = 0.90;   // доля разброса по главной оси у линейного знака

const ON_SURFACE = 0.02;   // допуск «на поверхности»: доля габарита
const SCALES_MIN = 3;      // сколько разных масштабов обязано быть
const SCALE_SPREAD = 20;   // во сколько раз крупнейший больше мельчайшего
const HOLLOW_CORE = 0.10;  // какая доля точек знака-обводки может попасть в его середину
const PAIR_MIN = 0.18;     // насколько два рода знаков обязаны отличаться отпечатком

// ── мелкая арифметика ─────────────────────────────────────────────────────────

function mean(a) { let s = 0; for (const v of a) s += v; return a.length ? s / a.length : 0; }
function distinct(a, q) { return new Set(a.map(v => Math.round(v * q))).size; }

// Доля разброса, объяснённая главной осью. У строки она под единицу, у россыпи около
// половины: так строка отличается от облака числом, а не на слово.
function mainAxisRatio(us, vs) {
  const mu = mean(us), mv = mean(vs);
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < us.length; i++) {
    const x = us[i] - mu, y = vs[i] - mv;
    sxx += x * x; syy += y * y; sxy += x * y;
  }
  const n = Math.max(1, us.length);
  sxx /= n; syy /= n; sxy /= n;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.max(0, tr * tr / 4 - det);
  const l1 = tr / 2 + Math.sqrt(disc);
  return tr > 0 ? l1 / tr : 0;
}

// Доля точек, попавших в середину знака. У обводки она около нуля, у заливки — заметная.
function coreShare(us, vs) {
  const mu = mean(us), mv = mean(vs);
  let rmax = 0;
  const rs = new Array(us.length);
  for (let i = 0; i < us.length; i++) {
    const r = Math.hypot(us[i] - mu, vs[i] - mv);
    rs[i] = r;
    if (r > rmax) rmax = r;
  }
  if (rmax <= 0) return 1;
  let inner = 0;
  for (const r of rs) if (r < rmax * 0.45) inner++;
  return inner / Math.max(1, us.length);
}

// Насколько ровно расставлены точки. У решётки-обоев шаг идеально одинаков и разброс
// около нуля; у крупного узора точки сбиты в блоки и разброс большой. Без этого признака
// решётка и узор неразличимы отпечатком — оба «регулярная сетка», — и гейт требовал бы
// от них выдуманной непохожести. Признак взят из существа референса, а не из удобства.
function spacingSpread(us, vs) {
  const n = us.length;
  const step = Math.max(1, Math.floor(n / 240));
  const ds = [];
  for (let i = 0; i < n; i += step) {
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = (us[i] - us[j]) * (us[i] - us[j]) + (vs[i] - vs[j]) * (vs[i] - vs[j]);
      if (d < best) best = d;
    }
    if (best < Infinity) ds.push(Math.sqrt(best));
  }
  if (ds.length < 2) return 0;
  const m = mean(ds);
  if (m <= 0) return 0;
  let acc = 0;
  for (const d of ds) acc += (d - m) * (d - m);
  return Math.min(1, Math.sqrt(acc / ds.length) / m);
}

function radialBands(us, vs) {
  const mu = mean(us), mv = mean(vs);
  let rmax = 0;
  const rs = [];
  for (let i = 0; i < us.length; i++) {
    const r = Math.hypot(us[i] - mu, vs[i] - mv);
    rs.push(r);
    if (r > rmax) rmax = r;
  }
  if (rmax <= 0) return 0;
  return new Set(rs.map(r => Math.round((r / rmax) * 12))).size / 13;
}

// ── отчёт ─────────────────────────────────────────────────────────────────────

let problems = [];
let lastProblems = [];
const bad = (m) => problems.push(m);
const quiet = process.argv.includes('--quiet');
const say = (m) => { if (!quiet) console.log(m); };

function finish(tag) {
  lastProblems = problems.slice();
  if (problems.length) {
    console.log('');
    for (const p of problems) console.log('  x ' + p);
    console.log('');
    console.log(tag + '_FAIL');
    return 1;
  }
  console.log(tag + '_OK');
  return 0;
}

// ── собственно проверка ───────────────────────────────────────────────────────

async function load(modPath, marksPath) {
  const abs = path.resolve(modPath);
  if (!fs.existsSync(abs)) throw new Error('нет файла ' + modPath);
  const surf = await import(pathToFileURL(abs).href + '?t=' + (globalThis.__MUTATE || 'base'));
  let marks = surf;
  if (marksPath && marksPath !== modPath) {
    const mabs = path.resolve(marksPath);
    if (!fs.existsSync(mabs)) throw new Error('нет файла ' + marksPath);
    marks = await import(pathToFileURL(mabs).href + '?t=' + (globalThis.__MUTATE || 'base'));
  }
  return { surf, marks };
}

const SPECS = {
  plane: { type: 'plane', origin: [-200, 0, -300], u: [1, 0, 0], v: [0, 1, 0], w: 400, h: 260 },
  cylinder: { type: 'cylinder', center: [0, 0, 0], radius: 180, height: 300 },
  sphere: { type: 'sphere', center: [0, 40, 0], radius: 150 },
};

function extentOf(spec) {
  if (spec.type === 'plane') return Math.max(spec.w, spec.h);
  if (spec.type === 'cylinder') return Math.max(spec.radius * 2, spec.height);
  return spec.radius * 2;
}

function distanceToSurface(spec, x, y, z) {
  if (spec.type === 'plane') {
    // нормаль плоскости — векторное произведение её осей
    const u = spec.u, v = spec.v;
    let nx = u[1] * v[2] - u[2] * v[1];
    let ny = u[2] * v[0] - u[0] * v[2];
    let nz = u[0] * v[1] - u[1] * v[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    return Math.abs((x - spec.origin[0]) * nx + (y - spec.origin[1]) * ny + (z - spec.origin[2]) * nz);
  }
  if (spec.type === 'cylinder') {
    return Math.abs(Math.hypot(x - spec.center[0], z - spec.center[2]) - spec.radius);
  }
  return Math.abs(Math.hypot(x - spec.center[0], y - spec.center[1], z - spec.center[2]) - spec.radius);
}

async function run(modPath, marksPath, tag) {
  problems = [];
  let surf, marks;
  try {
    ({ surf, marks } = await load(modPath, marksPath));
  } catch (e) {
    bad('модуль не загрузился: ' + e.message + ' — именно это `node --check` и не видит');
    return finish(tag);
  }

  if (typeof surf.buildSurface !== 'function') bad('нет buildSurface(seed, spec, opts)');
  if (typeof marks.buildMark !== 'function') bad('нет buildMark(kind, rng, opts)');
  if (!Array.isArray(marks.MARK_KINDS)) bad('нет списка MARK_KINDS');
  if (problems.length) return finish(tag);

  // 1. девять родов знаков на месте
  const missing = KINDS.filter(k => !marks.MARK_KINDS.includes(k));
  if (missing.length) bad('не хватает родов знаков: ' + missing.join(', '));
  say('родов знаков: ' + marks.MARK_KINDS.length + ' из ' + KINDS.length + ' обязательных');
  if (problems.length) return finish(tag);

  // 2. каждый род строится, знаки-обводки внутри пустые, отпечатки различимы
  const rngOf = (salt) => {
    let s = 1234567 + salt;
    return () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };
  const prints = {};
  for (let ki = 0; ki < KINDS.length; ki++) {
    const kind = KINDS[ki];
    let m;
    try { m = marks.buildMark(kind, rngOf(ki), {}); }
    catch (e) { bad('buildMark("' + kind + '") упал: ' + e.message); continue; }
    if (!m || !m.count || typeof m.fill !== 'function') { bad('buildMark("' + kind + '") вернул пустое'); continue; }
    if (!(m.scale > 0 && m.scale <= 1)) bad(kind + ': scale вне (0..1], а это доля габарита поверхности');

    const us = [], vs = [], gl = [];
    const out = [0, 0, 0];
    for (let i = 0; i < m.count; i++) {
      m.fill(i, out);
      if (out[0] < 0) continue;
      if (!(out[0] >= 0 && out[0] <= 1 && out[1] >= 0 && out[1] <= 1)) {
        bad(kind + ': fill вывел точку за пределы [0,1] — ' + out[0].toFixed(2) + ',' + out[1].toFixed(2));
        break;
      }
      us.push(out[0]); vs.push(out[1]); gl.push(out[2]);
    }
    if (us.length < 8) { bad(kind + ': слишком мало точек — ' + us.length); continue; }

    const core = coreShare(us, vs);
    const axis = mainAxisRatio(us, vs);
    const bands = radialBands(us, vs);
    const du = distinct(us, 20) / us.length;
    const spanU = Math.max(...us) - Math.min(...us);
    const spanV = Math.max(...vs) - Math.min(...vs);
    const aspect = spanU > 0 ? Math.min(1, spanV / spanU) : 1;
    const spread = spacingSpread(us, vs);
    prints[kind] = [axis, core, du, bands, aspect, spread];

    if (HOLLOW.includes(kind) && core > HOLLOW_CORE) {
      bad(kind + ': знак залит, а не обведён — в середине ' + (core * 100).toFixed(0)
        + '% точек при допуске ' + (HOLLOW_CORE * 100) + '%. Залитый знак читается пятном');
    }
    if (LINEAR.includes(kind) && axis < LINEAR_MIN) {
      bad(kind + ': знак не читается линией — по главной оси всего '
        + (axis * 100).toFixed(0) + '% разброса при пороге ' + (LINEAR_MIN * 100)
        + '%. Строка и разметка обязаны идти полосой, а не растекаться пятном');
    }
  }
  // Раньше здесь стоял ранний выход. Из-за него порча «все роды одинаковы» падала на
  // проверке линейности и до сверки отпечатков дело не доходило вовсе: самопроверка
  // показывала «поймано», а сверка родов при этом не работала ни разу.
  say('замкнутые знаки пустые внутри: ' + HOLLOW.join(', '));
  say('линейные знаки читаются полосой: ' + LINEAR.join(', '));

  // 3. роды различимы отпечатком, а не только именем: тот же приём, которым ловили
  //    близнецов среди форм на R25 и R26
  let worst = { a: '', b: '', d: 9 };
  for (let i = 0; i < KINDS.length; i++) {
    for (let j = i + 1; j < KINDS.length; j++) {
      const A = prints[KINDS[i]], B = prints[KINDS[j]];
      if (!A || !B) continue;
      let d = 0;
      for (let k = 0; k < A.length; k++) d += (A[k] - B[k]) * (A[k] - B[k]);
      d = Math.sqrt(d);
      if (d < worst.d) worst = { a: KINDS[i], b: KINDS[j], d };
    }
  }
  say('ближайшая пара родов: ' + worst.a + ' и ' + worst.b + ', расхождение '
    + worst.d.toFixed(3) + ' (нужно ' + PAIR_MIN + ')');
  if (worst.d < PAIR_MIN) {
    bad('роды знаков ' + worst.a + ' и ' + worst.b + ' неразличимы замером: расхождение '
      + worst.d.toFixed(3) + ' при пороге ' + PAIR_MIN + '. Разные имена, один рисунок');
  }

  // 4. укладка на поверхность
  for (const name of Object.keys(SPECS)) {
    const spec = SPECS[name];
    let r;
    try { r = surf.buildSurface('TEST-TEST-TEST', spec, {}); }
    catch (e) { bad('buildSurface на ' + name + ' упал: ' + e.message); continue; }
    if (!r || !r.count) { bad('buildSurface на ' + name + ' вернул пусто'); continue; }

    const ext = extentOf(spec);
    let off = 0, maxOff = 0;
    for (let i = 0; i < r.count; i++) {
      const d = distanceToSurface(spec, r.positions[i * 3], r.positions[i * 3 + 1], r.positions[i * 3 + 2]);
      if (d > maxOff) maxOff = d;
      if (d > ext * ON_SURFACE) off++;
    }
    const share = off / r.count;
    say(name + ': точек ' + r.count + ', вне поверхности ' + (share * 100).toFixed(1)
      + '%, худший отход ' + maxOff.toFixed(1) + ' при габарите ' + ext);
    if (share > 0.01) {
      bad(name + ': ' + (share * 100).toFixed(1) + '% точек лежат дальше '
        + (ON_SURFACE * 100) + '% габарита от поверхности — это облако вокруг неё, а не покрытие');
    }

    // нормали
    let badLen = 0;
    for (let i = 0; i < r.count; i++) {
      const l = Math.hypot(r.normals[i * 3], r.normals[i * 3 + 1], r.normals[i * 3 + 2]);
      if (Math.abs(l - 1) > 0.02) badLen++;
    }
    if (badLen) bad(name + ': ' + badLen + ' нормалей не единичной длины');
    const dirs = new Set();
    for (let i = 0; i < r.count; i++) {
      dirs.add(Math.round(r.normals[i * 3] * 10) + ':' + Math.round(r.normals[i * 3 + 1] * 10)
        + ':' + Math.round(r.normals[i * 3 + 2] * 10));
    }
    say(name + ': различных нормалей ' + dirs.size);
    if (name === 'plane' && dirs.size !== 1) bad('plane: у плоскости нормаль обязана быть одна, найдено ' + dirs.size);
    if (name !== 'plane' && dirs.size < 20) {
      bad(name + ': нормалей всего ' + dirs.size + ' — на кривой поверхности они обязаны '
        + 'смотреть в разные стороны, иначе знаки не лягут по форме');
    }

    // иерархия масштабов
    const sizes = [...new Set(Array.from(r.size).map(v => Math.round(v * 1000) / 1000))];
    const mx = Math.max(...sizes), mn = Math.min(...sizes.filter(v => v > 0));
    say(name + ': масштабов ' + sizes.length + ', разброс ' + (mx / mn).toFixed(1) + 'x');
    if (sizes.length < SCALES_MIN) {
      bad(name + ': масштабов всего ' + sizes.length + ', нужно не меньше ' + SCALES_MIN
        + ' — один размер на всю поверхность это обои, а не мир');
    } else if (mx / mn < SCALE_SPREAD) {
      bad(name + ': разброс масштабов ' + (mx / mn).toFixed(1) + 'x, нужно не меньше '
        + SCALE_SPREAD + 'x. Наполненность деталями берётся из иерархии размеров');
    }

    // роды на поверхности
    const used = new Set(Array.from(r.kind));
    if (used.size < 3) bad(name + ': на поверхности всего ' + used.size + ' родов знаков, нужно от трёх');
  }

  // 5. детерминизм
  try {
    const a = surf.buildSurface('SEED-AAAA-1111', SPECS.plane, {});
    const b = surf.buildSurface('SEED-AAAA-1111', SPECS.plane, {});
    let same = a.count === b.count;
    if (same) for (let i = 0; i < a.positions.length; i++) {
      if (a.positions[i] !== b.positions[i]) { same = false; break; }
    }
    say('тот же сид даёт ту же раскладку: ' + same);
    if (!same) bad('тот же сид даёт другую раскладку — нарушен инвариант 1, генерация обязана быть сеяной');

    const c = surf.buildSurface('SEED-BBBB-2222', SPECS.plane, {});
    let differs = c.count !== a.count;
    if (!differs) for (let i = 0; i < a.positions.length; i++) {
      if (a.positions[i] !== c.positions[i]) { differs = true; break; }
    }
    say('другой сид даёт другую раскладку: ' + differs);
    if (!differs) bad('другой сид даёт ту же раскладку — сид ни на что не влияет');
  } catch (e) {
    bad('проверка детерминизма упала: ' + e.message);
  }

  return finish(tag);
}

// ── самопроверка гейта ────────────────────────────────────────────────────────

// У каждой порчи записано, ПО КАКОЙ причине гейт обязан её завалить. Без этого
// порча может упасть по постороннему поводу, и слепота гейта останется незамеченной —
// ровно так и вышло на первом прогоне самопроверки.
const MUTATIONS = [
  ['volume', 'точки уехали с поверхности в объём', 'лежат дальше'],
  ['filled', 'знаки залиты вместо обводки', 'залит'],
  ['onescale', 'все знаки одного размера', 'масштаб'],
  ['flatnormals', 'нормали одинаковые на кривой поверхности', 'нормал'],
  ['twins', 'все девять родов рисуются одинаково', 'неразличимы замером'],
  ['random', 'Math.random вместо сеяного PRNG', 'тот же сид'],
];

async function selfTest() {
  const fixture = 'tools/fixture-surface.js';
  console.log('#'.repeat(78));
  console.log('САМОПРОВЕРКА ГЕЙТА: эталон обязан пройти, каждая порча — упасть');
  console.log('#'.repeat(78));
  let failures = 0;

  globalThis.__MUTATE = '';
  console.log('');
  console.log('--- эталон ---');
  const okBase = await run(fixture, fixture, 'ЭТАЛОН');
  if (okBase !== 0) { console.log('  !! эталон не прошёл — гейт требует того, чего нет в договоре'); failures++; }

  for (const [name, what, because] of MUTATIONS) {
    globalThis.__MUTATE = name;
    console.log('');
    console.log('--- порча "' + name + '": ' + what + ' ---');
    const r = await run(fixture, fixture, 'ПОРЧА_' + name.toUpperCase());
    if (r === 0) { console.log('  !! ГЕЙТ СЛЕП: порча прошла насквозь'); failures++; continue; }
    const hit = lastProblems.some(p => p.includes(because));
    if (!hit) {
      console.log('  !! упало, но НЕ ПО ТОЙ ПРИЧИНЕ: ждали претензию про "' + because + '"');
      failures++;
    } else {
      console.log('  поймано по своей причине: "' + because + '"');
    }
  }
  globalThis.__MUTATE = '';

  console.log('');
  console.log('#'.repeat(78));
  if (failures) {
    console.log('САМОПРОВЕРКА ПРОВАЛЕНА: ' + failures + ' — гейту верить нельзя');
    process.exit(1);
  }
  console.log('САМОПРОВЕРКА ПРОЙДЕНА: эталон проходит, все ' + MUTATIONS.length + ' порч ловятся');
  process.exit(0);
}

if (process.argv.includes('--self')) {
  await selfTest();
} else {
  const mod = arg('mod', 'src/world/surface.js');
  const marksPath = arg('marks', mod === 'src/world/surface.js' ? 'src/world/marks.js' : mod);
  process.exit(await run(mod, marksPath, 'SURFACE'));
}
