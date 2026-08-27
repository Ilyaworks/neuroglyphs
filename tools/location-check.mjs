// Проверяет локации: src/world/locations/<вид>.js.
//
//   node tools/location-check.mjs                    все виды
//   node tools/location-check.mjs --loc city         один вид
//   node tools/location-check.mjs --mod tools/fixture-location.js
//   node tools/location-check.mjs --self
//
// Один гейт на восемь локаций, а не восемь почти одинаковых файлов: так же, как
// shape-check держит весь каталог форм. Общие правила у всех локаций одни, а особое
// свойство у каждой своё, и оно записано в таблице ниже.
//
// Общее для всех:
//   * тела стоят НА линии пола, а не висят в воздухе;
//   * сквозь локацию есть проход — путь не завален телами;
//   * вариация зависит от сида, и за сотню сидов встречаются все три;
//   * размеры тел разные, а не один на всех;
//   * всё детерминировано по сиду.
//
// Особое у каждой — то, без чего локация не она:
//   city     улица шире тел по краям, здания разной высоты
//   towers   башня тем тоньше, чем выше; у каждой навершие шире ствола
//   canyon   стены неровные; сфера в небе крупная и не загораживает проход
//   hall     помещение ЗАМКНУТО и у него есть потолок выше сферы
//   arcade   шесть и больше арок подряд, размер убывает вдаль, шаг одинаковый
//   tunnel   кольца соосны, радиус убывает, на стенке есть строки
//   vortex   закрутка колец нарастает вдоль оси, в глубине ядро
//   crowns   ветвление не меньше трёх уровней, толщина убывает с каждым
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

const KINDS = ['city', 'towers', 'canyon', 'hall', 'arcade', 'tunnel', 'vortex', 'crowns'];
const SEEDS = 60;
const FLOAT_TOL = 4;      // насколько тело может не доставать до линии пола
const CLEARANCE = 30;     // насколько путь обязан быть свободен от тел

function seedFor(i) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let k = 0; k < 12; k++) s += abc[(i * 5 + k * 11 + 7) % abc.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}

const sizeOf = (b) => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];

function hitsPath(b, p, pad) {
  return p[0] > b.min[0] - pad && p[0] < b.max[0] + pad
    && p[1] > b.min[1] - pad && p[1] < b.max[1] + pad
    && p[2] > b.min[2] - pad && p[2] < b.max[2] + pad;
}

function checkKind(kind, loc, bad) {
  const solids = loc.solids || [];

  if (kind === 'towers') {
    // Башня тем тоньше, чем выше: отношение высоты к толщине не меньше пяти.
    const stems = solids.filter(b => sizeOf(b)[1] > 120);
    if (!stems.length) { bad('towers: нет ни одной башни выше 120'); return; }
    let squat = 0;
    for (const b of stems) {
      const [w, h, d] = sizeOf(b);
      if (h / Math.max(w, d) < 5) squat++;
    }
    if (squat > stems.length * 0.2) {
      bad('towers: ' + squat + ' башен из ' + stems.length + ' приземистые — отношение высоты '
        + 'к толщине ниже пяти. Это частокол столбов, а не лес башен');
    }
    // Навершие: тело шире ствола, сидящее на его верхушке.
    let capped = 0;
    for (const b of stems) {
      const [w, h, d] = sizeOf(b);
      const top = b.max[1];
      const cap = solids.find(c => c !== b
        && Math.abs(c.min[1] - top) < 30
        && Math.abs((c.min[0] + c.max[0]) / 2 - (b.min[0] + b.max[0]) / 2) < w
        && sizeOf(c)[0] > w * 1.3);
      if (cap) capped++;
    }
    if (capped < stems.length * 0.8) {
      bad('towers: навершие есть только у ' + capped + ' башен из ' + stems.length
        + ' — на кадре референса у каждой башни купол-зонт наверху');
    }
  }

  if (kind === 'canyon') {
    // Стены неровные: разброс по глубине заметно больше, чем у ровной плиты.
    const xs = solids.map(b => (b.min[0] + b.max[0]) / 2);
    const left = solids.filter((b, i) => xs[i] < 0).map(b => (b.min[2] + b.max[2]) / 2);
    const right = solids.filter((b, i) => xs[i] > 0).map(b => (b.min[2] + b.max[2]) / 2);
    if (!left.length || !right.length) bad('canyon: стена есть только с одной стороны — это не каньон');
    const jag = solids.map(b => (b.min[0] + b.max[0]) / 2);
    const uniq = new Set(jag.map(v => Math.round(v / 20))).size;
    if (uniq < 4) {
      bad('canyon: стены ровные — центры тел встают всего в ' + uniq + ' положения по ширине. '
        + 'Обрыв обязан быть неровным, иначе это стена здания, а не скала');
    }
    if (!loc.sphere) bad('canyon: нет сферы в небе');
    else {
      if (loc.sphere.radius < 120) bad('canyon: сфера в небе мелкая, радиус ' + loc.sphere.radius);
      const low = loc.sphere.center[1] - loc.sphere.radius;
      if (low < loc.floorY + 300) bad('canyon: сфера висит слишком низко и загораживает проход');
    }
  }

  if (kind === 'hall') {
    // Замкнутость: из середины в любую сторону по горизонтали упираемся в тело.
    const c = [(loc.bounds.min[0] + loc.bounds.max[0]) / 2, loc.floorY + 60,
      (loc.bounds.min[2] + loc.bounds.max[2]) / 2];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of dirs) {
      let hit = false;
      for (let t = 20; t < 2000 && !hit; t += 10) {
        const x = c[0] + dx * t, z = c[2] + dz * t;
        for (const b of solids) {
          if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2]
            && c[1] > b.min[1] && c[1] < b.max[1]) { hit = true; break; }
        }
      }
      if (!hit) {
        bad('hall: из середины в сторону [' + dx + ',' + dz + '] ничего нет — помещение не замкнуто, '
          + 'а зал обязан быть закрытым: это первый интерьер в проекте');
        break;
      }
    }
    if (!loc.ceiling) bad('hall: нет потолка — без него это двор, а не зал');
    else if (loc.sphere && loc.ceiling.y < loc.sphere.center[1] + loc.sphere.radius) {
      bad('hall: потолок ниже верхушки сферы — сфера торчит сквозь крышу');
    }
    if (!loc.sphere) bad('hall: нет сферы в середине зала');
  }

  if (kind === 'arcade') {
    const a = (loc.arches || []).slice().sort((p, q) => q.z - p.z);
    if (a.length < 6) { bad('arcade: арок всего ' + a.length + ', нужно от шести подряд'); return; }
    let grew = 0;
    for (let i = 1; i < a.length; i++) if (a[i].width >= a[i - 1].width) grew++;
    if (grew > 1) {
      bad('arcade: размер арок не убывает вдаль (' + grew + ' случаев роста) — без убывания '
        + 'нет перспективы, а перспектива тут главное');
    }
    const steps = [];
    for (let i = 1; i < a.length; i++) steps.push(Math.abs(a[i].z - a[i - 1].z));
    const mean = steps.reduce((s, v) => s + v, 0) / steps.length;
    const off = steps.filter(v => Math.abs(v - mean) > mean * 0.25).length;
    if (off) bad('arcade: шаг между арками неровный в ' + off + ' местах — анфилада рассыпается');
  }

  if (kind === 'tunnel' || kind === 'vortex') {
    const r = (loc.rings || []).slice().sort((p, q) => q.z - p.z);
    if (r.length < 6) { bad(kind + ': колец всего ' + r.length + ', нужно от шести'); return; }
    const offs = r.map(x => Math.hypot(x.center[0], x.center[2] - x.z));
    const maxOff = Math.max(...offs);
    const rad = r[0].radius;
    if (maxOff > rad * 0.02) {
      bad(kind + ': кольца не соосны — центр гуляет на ' + maxOff.toFixed(0)
        + ' при радиусе ' + rad.toFixed(0) + '. Это труба-гармошка, а не туннель');
    }
    let grew = 0;
    for (let i = 1; i < r.length; i++) if (r[i].radius > r[i - 1].radius + 0.01) grew++;
    if (grew > 1) bad(kind + ': радиус колец не убывает вдаль — нет ощущения глубины');
    if (kind === 'tunnel') {
      const hasText = (loc.surfaces || []).some(s => (s.marks || []).some(m => m === 'formula' || m === 'string'));
      if (!hasText) bad('tunnel: на стенке нет ни строк, ни формул — на референсе они читаются крупно');
    }
    if (kind === 'vortex') {
      let mono = true;
      for (let i = 1; i < r.length; i++) if (!(r[i].twist > r[i - 1].twist)) { mono = false; break; }
      if (!mono) bad('vortex: закрутка колец не нарастает вдоль оси — это обычный туннель, а не воронка');
      if (!loc.sphere || !loc.sphere.core) bad('vortex: в глубине нет светящегося ядра');
    }
  }

  if (kind === 'crowns') {
    const b = loc.branches || [];
    const levels = new Set(b.map(x => x.level));
    if (levels.size < 3) {
      bad('crowns: уровней ветвления всего ' + levels.size + ', нужно от трёх — без ветвления '
        + 'это облако, а не крона');
    }
    const byLevel = {};
    for (const x of b) byLevel[x.level] = Math.max(byLevel[x.level] || 0, x.thick);
    const ls = Object.keys(byLevel).map(Number).sort((p, q) => p - q);
    for (let i = 1; i < ls.length; i++) {
      if (byLevel[ls[i]] >= byLevel[ls[i - 1]]) {
        bad('crowns: ветви уровня ' + ls[i] + ' не тоньше уровня ' + ls[i - 1]
          + ' — концы обязаны быть тоньше основания');
        break;
      }
    }
  }

  if (kind === 'city') {
    const hs = solids.map(b => sizeOf(b)[1]);
    const uniq = new Set(hs.map(v => Math.round(v / 40))).size;
    if (uniq < 3) bad('city: здания одной высоты (' + uniq + ' разных) — это забор, а не город');
  }
}

async function runOnce(modPath, only) {
  const problems = [];
  const bad = (m) => problems.push(m);

  const abs = path.resolve(modPath);
  if (!fs.existsSync(abs)) {
    return ['модуль не загрузился: нет файла ' + modPath + ' — именно это `node --check` и не видит'];
  }
  let mod;
  try { mod = await import(freshUrl(pathToFileURL(abs).href)); }
  catch (e) { return ['модуль не загрузился: ' + e.message + ' — именно это `node --check` и не видит']; }
  if (typeof mod.buildLocation !== 'function') return ['нет buildLocation(kind, seed, opts)'];

  const list = only ? [only] : KINDS;
  for (const kind of list) {
    let loc;
    try { loc = mod.buildLocation(kind, 'TEST-TEST-TEST', {}); }
    catch (e) { bad(kind + ': buildLocation упал: ' + e.message); continue; }
    if (!loc || !Array.isArray(loc.solids)) { bad(kind + ': вернул локацию без тел'); continue; }

    // ── общее: тела стоят на линии пола ──────────────────────────────────────
    // Кроме труб: у туннеля и воронки нет построек, там кольца вокруг оси, и требовать
    // от них опоры на пол — мерить не то. Самопроверка поймала это на эталоне.
    const TUBES = kind === 'tunnel' || kind === 'vortex';
    const grounded = loc.solids.filter(b => Math.abs(b.min[1] - loc.floorY) <= FLOAT_TOL).length;
    if (!TUBES && grounded === 0) {
      bad(kind + ': ни одно тело не стоит на линии пола — постройки висят в воздухе');
    }

    // ── общее: путь свободен ─────────────────────────────────────────────────
    let blockedAt = -1;
    for (let i = 0; i < (loc.path || []).length; i++) {
      if (loc.solids.some(b => hitsPath(b, loc.path[i], CLEARANCE))) { blockedAt = i; break; }
    }
    if (blockedAt >= 0) {
      bad(kind + ': проход завален телом в точке ' + blockedAt + ' пути — сквозь локацию не пройти');
    }

    // ── общее: размеры разные ────────────────────────────────────────────────
    const vols = new Set(loc.solids.map(b => {
      const [w, h, d] = sizeOf(b);
      return Math.round(w / 10) + ':' + Math.round(h / 10) + ':' + Math.round(d / 10);
    }));
    if (loc.solids.length > 4 && vols.size < 3) {
      bad(kind + ': все тела одного размера (' + vols.size + ' разных) — мир из одинаковых кубиков');
    }

    // ── особое для вида ──────────────────────────────────────────────────────
    checkKind(kind, loc, bad);

    // ── вариации от сида ─────────────────────────────────────────────────────
    const seen = new Set();
    for (let i = 0; i < SEEDS; i++) {
      try { seen.add(mod.buildLocation(kind, seedFor(i), {}).variant); }
      catch (e) { bad(kind + ': упал на сиде ' + seedFor(i) + ': ' + e.message); break; }
    }
    if (seen.size < 3) {
      bad(kind + ': за ' + SEEDS + ' сидов встретилось ' + seen.size
        + ' вариаций, нужно от трёх — вариация не зависит от сида');
    }
    say(kind + ': тел ' + loc.solids.length + ', на полу ' + grounded
      + ', размеров ' + vols.size + ', вариаций за ' + SEEDS + ' сидов ' + seen.size);

    // ── детерминизм ──────────────────────────────────────────────────────────
    try {
      const a = JSON.stringify(mod.buildLocation(kind, 'SEED-AAAA-1111', {}));
      const b = JSON.stringify(mod.buildLocation(kind, 'SEED-AAAA-1111', {}));
      const c = JSON.stringify(mod.buildLocation(kind, 'SEED-BBBB-2222', {}));
      if (a !== b) bad(kind + ': тот же сид даёт другую локацию — нарушен инвариант 1');
      if (a === c) bad(kind + ': другой сид даёт ту же локацию — сид ни на что не влияет');
    } catch (e) {
      bad(kind + ': проверка детерминизма упала: ' + e.message);
    }
  }

  return problems;
}

const MUTATIONS = [
  ['flying', 'постройки висят, не стоят на полу', 'висят в воздухе'],
  ['blocked', 'проход завален телами', 'проход завален'],
  ['onevariant', 'вариация не зависит от сида', 'вариаций'],
  ['samesize', 'все тела одного размера', 'одного размера'],
  ['noshape', 'нарушено главное свойство вида', 'towers'],
  ['random', 'Math.random вместо сеяного PRNG', 'тот же сид'],
];

if (process.argv.includes('--self')) {
  process.exit(await selfTest({
    title: 'location-check — восемь локаций',
    fixture: 'tools/fixture-location.js',
    mutations: MUTATIONS,
    runOnce: (f) => runOnce(f, null),
  }));
} else {
  const only = arg('loc', null);
  if (only && !KINDS.includes(only)) {
    console.log('неизвестная локация: ' + only + '. Есть: ' + KINDS.join(', '));
    process.exit(1);
  }
  const mod = arg('mod', only ? 'src/world/locations/' + only + '.js' : 'src/world/locations/index.js');
  const problems = await runOnce(mod, only);
  if (problems.length) {
    console.log('');
    for (const p of problems) console.log('  x ' + p);
    console.log('');
    console.log('LOCATION_FAIL');
    process.exit(1);
  }
  console.log('LOCATION_OK');
}
