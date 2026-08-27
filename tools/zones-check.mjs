// Проверяет членение мира на зоны: src/world/zones.js.
//
//   node tools/zones-check.mjs
//   node tools/zones-check.mjs --mod tools/fixture-zones.js
//   node tools/zones-check.mjs --self
//
// Зачем. Заказчик просил: «иногда в одном сиде разные локации и доп фигуры, иногда
// одного вида, но таких должно быть меньшее количество», и отдельно — чтобы локации
// «не накладывались друг на друга, а одна из другой выходила». И то и другое легко
// сдать неработающим: сделать один вид зоны на все сиды, поставить зоны внахлёст,
// забыть переход на стыке. Ни счёт экспортов, ни `node --check` этого не видят.
//
// Здесь мерятся свойства результата, и главное из них — РАСПРЕДЕЛЕНИЕ по сотне сидов.
// Пожелание «таких должно быть меньше» превращается в число, иначе его никто не
// проверит и оно останется словами.
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

// Выборка большая, а пороги с запасом — и это не небрежность. Доля на выборке гуляет
// от случая к случаю: на сотне сидов при цели 20% разброс около 4%, и порог «не больше
// 20%» падал бы через раз на честной реализации. Гейт-флак хуже мягкого гейта: его
// начинают перезапускать, пока не позеленеет.
// Цель договора — 70 / 20 / 10. Гейт держит границы, за которыми это уже не цель,
// а поломка, и при выборке в 400 сидов до них пять стандартных отклонений.
const SEEDS = 400;           // на скольких сидах смотрим распределение
const MIN_DIFFERENT = 0.60;  // доля миров из РАЗНЫХ локаций (цель 0.70)
const MAX_SINGLE = 0.30;     // доля миров из одной локации (цель 0.20)
const SAME_RANGE = [0.03, 0.25]; // доля миров из двух вариаций одного вида (цель 0.10)
const MAX_OVERLAP = 0.05;    // насколько зоны могут налезать: доля габарита

function seedFor(i) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let k = 0; k < 12; k++) s += abc[(i * 7 + k * 13 + 5) % abc.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}

function overlapDepth(a, b) {
  // Насколько два габарита налезают друг на друга по каждой оси; берём наименьшее —
  // если хоть по одной оси пересечения нет, тела не пересекаются вовсе.
  let least = Infinity;
  for (let ax = 0; ax < 3; ax++) {
    const lo = Math.max(a.min[ax], b.min[ax]);
    const hi = Math.min(a.max[ax], b.max[ax]);
    least = Math.min(least, hi - lo);
  }
  return least;
}

function inside(b, p, pad = 0) {
  for (let ax = 0; ax < 3; ax++) {
    if (p[ax] < b.min[ax] - pad || p[ax] > b.max[ax] + pad) return false;
  }
  return true;
}

async function runOnce(modPath) {
  const problems = [];
  const bad = (m) => problems.push(m);

  const abs = path.resolve(modPath);
  if (!fs.existsSync(abs)) {
    return ['модуль не загрузился: нет файла ' + modPath + ' — именно это `node --check` и не видит'];
  }
  let mod;
  try {
    mod = await import(freshUrl(pathToFileURL(abs).href));
  } catch (e) {
    return ['модуль не загрузился: ' + e.message + ' — именно это `node --check` и не видит'];
  }
  if (typeof mod.buildZones !== 'function') return ['нет buildZones(seed, opts)'];

  // ── 1. распределение по сотне сидов ─────────────────────────────────────────
  let single = 0, different = 0, sameKind = 0;
  const counts = new Set();
  const kindsSeen = new Set();
  let firstBad = '';

  for (let i = 0; i < SEEDS; i++) {
    let w;
    try { w = mod.buildZones(seedFor(i), {}); }
    catch (e) { bad('buildZones упал на сиде ' + seedFor(i) + ': ' + e.message); break; }
    if (!w || !Array.isArray(w.zones) || !w.zones.length) { bad('buildZones вернул мир без зон'); break; }

    const z = w.zones;
    counts.add(z.length);
    for (const zz of z) kindsSeen.add(zz.kind);

    if (z.length === 1) single++;
    else {
      const kinds = new Set(z.map(x => x.kind));
      if (kinds.size > 1) different++;
      else {
        sameKind++;
        const vars = new Set(z.map(x => x.variant));
        if (vars.size < 2 && !firstBad) {
          firstBad = 'на сиде ' + seedFor(i) + ' две зоны одного вида и одной вариации — '
            + 'это одна зона, разрезанная надвое, а не два места';
        }
      }
    }

    // ── 2. зоны не налезают друг на друга ────────────────────────────────────
    for (let a = 0; a < z.length && !problems.length; a++) {
      for (let b = a + 1; b < z.length; b++) {
        const d = overlapDepth(z[a].bounds, z[b].bounds);
        if (d <= 0) continue;
        const ext = Math.max(
          z[a].bounds.max[2] - z[a].bounds.min[2],
          z[a].bounds.max[0] - z[a].bounds.min[0],
        );
        if (d > ext * MAX_OVERLAP) {
          bad('зоны ' + a + ' и ' + b + ' на сиде ' + seedFor(i) + ' налезают друг на друга на '
            + d.toFixed(0) + ' при допуске ' + (ext * MAX_OVERLAP).toFixed(0)
            + ' — это наложение, а не переход. Наложение в проекте уже есть, оно называется '
            + 'layoutCrossedWorlds, и просили не его');
          break;
        }
      }
    }

    // ── 3. стык: переходная полоса между соседними зонами ────────────────────
    if (z.length > 1) {
      const joints = Array.isArray(w.joints) ? w.joints : [];
      if (joints.length !== z.length - 1) {
        bad('зон ' + z.length + ', а стыков ' + joints.length + ' на сиде ' + seedFor(i)
          + ' — между каждой парой соседних зон обязан быть переход, иначе места просто '
          + 'стоят рядом, а не выходят одно из другого');
      } else {
        for (const j of joints) {
          if (!j.band || !(j.band.max > j.band.min)) {
            bad('стык между зонами ' + j.a + ' и ' + j.b + ' без переходной полосы');
            break;
          }
          const za = z[j.a], zb = z[j.b];
          const touchesA = j.band.min <= za.bounds.max[2] && j.band.max >= za.bounds.min[2];
          const touchesB = j.band.min <= zb.bounds.max[2] && j.band.max >= zb.bounds.min[2];
          if (!touchesA || !touchesB) {
            bad('переходная полоса стыка ' + j.a + '/' + j.b + ' не задевает обе зоны');
            break;
          }
        }
      }
    }

    // ── 4. путь проходит через все зоны, портал в последней ──────────────────
    const pathPts = Array.isArray(w.path) ? w.path : [];
    for (let zi = 0; zi < z.length; zi++) {
      const hit = pathPts.some(p => inside(z[zi].bounds, p));
      if (!hit) {
        bad('путь не заходит в зону ' + zi + ' на сиде ' + seedFor(i)
          + ' — до неё нельзя долететь, значит её нет');
        break;
      }
    }
    if (Array.isArray(w.portal)) {
      const lastZone = z[z.length - 1];
      if (!inside(lastZone.bounds, w.portal, 60)) {
        bad('портал висит вне последней зоны на сиде ' + seedFor(i)
          + ' — на кадре референса он стоит в торце улицы, а не в пустоте');
      }
    } else bad('нет портала');

    // ── 5. фигуры внутри своих зон и не в стыках ─────────────────────────────
    for (const f of (w.figures || [])) {
      const z0 = z[f.zone];
      if (!z0) { bad('фигура ссылается на несуществующую зону ' + f.zone); break; }
      if (!inside(z0.bounds, f.position)) {
        bad('фигура "' + f.name + '" лежит вне своей зоны на сиде ' + seedFor(i));
        break;
      }
      const inJoint = (w.joints || []).some(j =>
        f.position[2] >= j.band.min && f.position[2] <= j.band.max);
      if (inJoint) {
        bad('фигура "' + f.name + '" попала в стык между зонами — на переходе её разорвёт');
        break;
      }
    }

    if (problems.length) break;
  }

  if (firstBad) bad(firstBad);

  if (!problems.length) {
    const dShare = different / SEEDS, sShare = single / SEEDS, kShare = sameKind / SEEDS;
    say('на ' + SEEDS + ' сидах: разных локаций ' + (dShare * 100).toFixed(0)
      + '%, одиночных ' + (sShare * 100).toFixed(0)
      + '%, одного вида разных вариаций ' + (kShare * 100).toFixed(0) + '%');
    say('число зон в мире: ' + [...counts].sort().join(', ') + '; видов встретилось ' + kindsSeen.size);

    if (dShare < MIN_DIFFERENT) {
      bad('миров из РАЗНЫХ локаций всего ' + (dShare * 100).toFixed(0) + '%, нужно от '
        + (MIN_DIFFERENT * 100) + '% — распределение сломано, мир почти всегда однообразен');
    }
    if (sShare > MAX_SINGLE) {
      bad('миров из одной локации ' + (sShare * 100).toFixed(0) + '%, допустимо до '
        + (MAX_SINGLE * 100) + '% — такие должны быть редкостью, а не правилом');
    }
    if (kShare < SAME_RANGE[0] || kShare > SAME_RANGE[1]) {
      bad('миров из двух вариаций одного вида ' + (kShare * 100).toFixed(0)
        + '%, ждали от ' + (SAME_RANGE[0] * 100) + '% до ' + (SAME_RANGE[1] * 100) + '%');
    }
    if (counts.size < 2) bad('число зон одинаково на всех сидах — сид на членение не влияет');
    if (kindsSeen.size < 3) bad('за сто сидов встретилось всего ' + kindsSeen.size
      + ' видов локаций — сид не выбирает вид');
  }

  // ── 6. детерминизм ──────────────────────────────────────────────────────────
  // Проверяется ВСЕГДА, а не только когда всё прочее чисто. Пока стояло условие
  // «если претензий нет», порча с Math.random валилась на распределении, до сверки
  // сидов дело не доходило, и самопроверка честно сказала: поймано не по той причине.
  {
    try {
      const a = JSON.stringify(mod.buildZones('SEED-AAAA-1111', {}));
      const b = JSON.stringify(mod.buildZones('SEED-AAAA-1111', {}));
      const c = JSON.stringify(mod.buildZones('SEED-BBBB-2222', {}));
      say('тот же сид даёт то же членение: ' + (a === b));
      if (a !== b) bad('тот же сид даёт другое членение — нарушен инвариант 1');
      if (a === c) bad('другой сид даёт то же членение — сид ни на что не влияет');
    } catch (e) {
      bad('проверка детерминизма упала: ' + e.message);
    }
  }

  return problems;
}

const MUTATIONS = [
  ['overlap', 'зоны налезают друг на друга объёмами', 'налезают'],
  ['nojoint', 'стыков нет, зоны просто стоят рядом', 'стыков'],
  ['monotone', 'почти всегда одна зона', 'одной локации'],
  ['figuresout', 'фигуры лежат вне своих зон', 'вне своей зоны'],
  ['portalfloat', 'портал висит не в последней зоне', 'вне последней зоны'],
  ['random', 'Math.random вместо сеяного PRNG', 'тот же сид'],
];

if (process.argv.includes('--self')) {
  process.exit(await selfTest({
    title: 'zones-check — членение мира на зоны',
    fixture: 'tools/fixture-zones.js',
    mutations: MUTATIONS,
    runOnce,
  }));
} else {
  const problems = await runOnce(arg('mod', 'src/world/zones.js'));
  if (problems.length) {
    console.log('');
    for (const p of problems) console.log('  x ' + p);
    console.log('');
    console.log('ZONES_FAIL');
    process.exit(1);
  }
  console.log('ZONES_OK');
}
