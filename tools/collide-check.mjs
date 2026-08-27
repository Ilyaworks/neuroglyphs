// Проверяет осязаемость мира: src/player/collide.js.
//
//   node tools/collide-check.mjs
//   node tools/collide-check.mjs --mod tools/fixture-collide.js
//   node tools/collide-check.mjs --self
//
// Зачем. Заказчик отменил прежнее решение концепции «no collision»: «предметы, города,
// поверхности должны быть осязаемы, и через них нельзя пройти сквозь». Проверка вида
// «модуль есть» этого не стережёт, и провалиться тут можно тремя разными способами,
// причём два из них ХУЖЕ, чем отсутствие столкновений вовсе:
//
//   * сквозь стены по-прежнему пролетаем — работы нет;
//   * при упоре камера встаёт колом: играть невозможно, движение просто умирает;
//   * из угла между двумя стенами не выбраться — игрок заперт навсегда.
//
// Поэтому здесь мерится не только «стена держит», но и «вдоль стены скользит» и «из
// угла есть выход». И отдельно — что точка входа ни на одном сиде не оказывается
// внутри тела: появиться замурованным хуже всего.
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

const SEEDS = 60;          // на скольких сидах проверяем точку входа
const SLIDE_KEEP = 0.5;    // какую долю движения вдоль стены обязано сохранить скольжение
const STEP = 24;           // длина шага игрока за кадр на разгоне

function seedFor(i) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let k = 0; k < 12; k++) s += abc[(i * 11 + k * 7 + 3) % abc.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

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
  if (typeof mod.buildCollider !== 'function') return ['нет buildCollider(seed, opts)'];

  // Стены для проверки задаёт ГЕЙТ, а не модуль. Первая редакция строила коллайдер
  // без опций и проверяла его на стенах, которые придумал эталон, — то есть требовала
  // от продукта выдумать ровно те же. Проверка на заданной геометрии меряет столкновения,
  // а не совпадение фантазий.
  const TEST_FLOOR = -40;
  const TEST_SOLIDS = [
    { min: [40, TEST_FLOOR, -400], max: [90, TEST_FLOOR + 300, 40] },
    { min: [-400, TEST_FLOOR, 40], max: [90, TEST_FLOOR + 300, 90] },
  ];
  let col;
  try { col = mod.buildCollider('TEST-TEST-TEST', { floorY: TEST_FLOOR, solids: TEST_SOLIDS }); }
  catch (e) { return ['buildCollider упал: ' + e.message]; }
  if (typeof col.blocked !== 'function') bad('нет blocked(x, y, z)');
  if (typeof col.resolve !== 'function') bad('нет resolve(from, to, out)');
  if (problems.length) return problems;

  const out = [0, 0, 0];
  const floorY = col.floorY !== undefined ? col.floorY : -40;
  const eye = floorY + 8;

  // ── 1. стена держит ─────────────────────────────────────────────────────────
  // Идём в лоб в стену, стоящую по x = 40..90, много шагов подряд. Ни один шаг не
  // должен занести нас за неё.
  {
    let p = [-60, eye, 0];
    let crossed = false;
    for (let i = 0; i < 40; i++) {
      const to = [p[0] + STEP, p[1], p[2]];
      col.resolve(p, to, out);
      p = [out[0], out[1], out[2]];
      if (p[0] > 45) { crossed = true; break; }
    }
    say('в лоб в стену: остановились на x=' + p[0].toFixed(1) + ' (стена начинается с 40)');
    if (crossed) {
      bad('сквозь стену прошли насквозь: оказались на x=' + p[0].toFixed(1)
        + ' за её передней гранью. Стена не держит');
    }
    if (col.blocked(60, eye, 0) === false) {
      bad('blocked() говорит, что точка внутри стены свободна — сквозь стену пройдут и без resolve');
    }
  }

  // ── 2. вдоль стены скользим, а не встаём колом ──────────────────────────────
  // Двигаемся под углом к стене: часть движения упирается, часть обязана пройти вдоль.
  // Скользим ПРОЧЬ от угла, а не в него. Первая версия шла в сторону угла двух стен и
  // упиралась в него на середине пути: проверка мерила не скольжение, а тупик. Из-за
  // этого эталон падал, а порча «ловушка» ловилась чужой проверкой — самопроверка это
  // и показала.
  const STEPS = 10;
  {
    let p = [20, eye, -100];
    const start = p.slice();
    for (let i = 0; i < STEPS; i++) {
      const to = [p[0] + STEP * 0.7, p[1], p[2] - STEP * 0.7];
      col.resolve(p, to, out);
      p = [out[0], out[1], out[2]];
    }
    const along = Math.abs(p[2] - start[2]);
    const want = STEPS * STEP * 0.7 * SLIDE_KEEP;
    say('вдоль стены под углом: прошли ' + along.toFixed(0) + ' при ожидании от ' + want.toFixed(0));
    if (along < want) {
      bad('вдоль стены не скользим: за ' + STEPS + ' шагов сдвинулись всего на ' + along.toFixed(0)
        + ' при ожидании от ' + want.toFixed(0) + '. Камера встаёт колом, и это хуже, '
        + 'чем пролететь насквозь: играть становится невозможно');
    }
  }

  // ── 3. из угла есть выход ───────────────────────────────────────────────────
  // Ставим игрока в угол между двумя стенами и уводим прочь. Он обязан выбраться.
  // Сначала ЗАГОНЯЕМ игрока в угол, и только потом проверяем выход. Первая версия
  // ставила его рядом с углом, в открытом месте: путь наружу там свободен, скольжение
  // не нужно вовсе, и ловушка проходила гейт насквозь — самопроверка это показала.
  // Выход берём диагональю, у которой одна ось упирается в стену: именно на такой
  // диагонали и запирает неверная реализация.
  {
    let p = [-20, eye, -20];
    for (let i = 0; i < 10; i++) {
      const to = [p[0] + STEP, p[1], p[2] + STEP];
      col.resolve(p, to, out);
      p = [out[0], out[1], out[2]];
    }
    const wedged = p.slice();
    say('загнали в угол: x=' + wedged[0].toFixed(1) + ' z=' + wedged[2].toFixed(1));
    for (let i = 0; i < 10; i++) {
      const to = [p[0] + STEP, p[1], p[2] - STEP];
      col.resolve(p, to, out);
      p = [out[0], out[1], out[2]];
    }
    const moved = dist(p, wedged);
    say('выход из угла скольжением: отошли на ' + moved.toFixed(0));
    if (moved < STEP) {
      bad('из угла между стенами не выбраться: зажатый в углу игрок за десять шагов '
        + 'прочь сдвинулся на ' + moved.toFixed(0) + '. Он заперт навсегда — это ловушка, '
        + 'а не препятствие');
    }
  }

  // ── 4. сквозь пол не проваливаемся ──────────────────────────────────────────
  {
    let p = [-200, eye, -200];
    for (let i = 0; i < 30; i++) {
      const to = [p[0], p[1] - STEP, p[2]];
      col.resolve(p, to, out);
      p = [out[0], out[1], out[2]];
    }
    say('вниз через пол: остановились на y=' + p[1].toFixed(1) + ' при линии пола ' + floorY);
    if (p[1] < floorY) {
      bad('провалились сквозь пол до y=' + p[1].toFixed(1) + ' при линии пола ' + floorY);
    }
  }

  // ── 5. точка входа не внутри тела ни на одном сиде ──────────────────────────
  {
    let stuck = 0, first = '';
    for (let i = 0; i < SEEDS; i++) {
      let c;
      try { c = mod.buildCollider(seedFor(i), {}); }
      catch (e) { bad('buildCollider упал на сиде ' + seedFor(i) + ': ' + e.message); break; }
      const sp = c.spawn || [0, (c.floorY ?? floorY) + 8, 0];
      if (c.blocked(sp[0], sp[1], sp[2])) {
        stuck++;
        if (!first) first = seedFor(i);
      }
    }
    say('точка входа свободна на ' + (SEEDS - stuck) + ' сидах из ' + SEEDS);
    if (stuck) {
      bad('на ' + stuck + ' сидах из ' + SEEDS + ' точка входа оказалась внутри тела (первый — '
        + first + '): игрок появляется замурованным, и это худший из отказов');
    }
  }

  // ── 6. детерминизм ──────────────────────────────────────────────────────────
  {
    try {
      const a = mod.buildCollider('SEED-AAAA-1111', {});
      const b = mod.buildCollider('SEED-AAAA-1111', {});
      const c = mod.buildCollider('SEED-BBBB-2222', {});
      const probe = [];
      for (let i = 0; i < 200; i++) {
        const x = -500 + i * 5, z = -700 + i * 6, y = floorY + 30;
        probe.push([a.blocked(x, y, z), b.blocked(x, y, z), c.blocked(x, y, z)]);
      }
      const same = probe.every(p => p[0] === p[1]);
      const differs = probe.some(p => p[0] !== p[2]);
      say('тот же сид даёт ту же расстановку тел: ' + same);
      if (!same) bad('тот же сид даёт другую расстановку — нарушен инвариант 1, генерация обязана быть сеяной');
      if (!differs) bad('другой сид даёт ту же расстановку — сид ни на что не влияет');
    } catch (e) {
      bad('проверка детерминизма упала: ' + e.message);
    }
  }

  return problems;
}

const MUTATIONS = [
  ['ghost', 'сквозь стены пролетаем', 'сквозь стену'],
  ['sticky', 'при упоре камера встаёт колом', 'не скользим'],
  ['trap', 'из угла не выбраться', 'из угла'],
  ['spawninside', 'точка входа внутри стены', 'замурованным'],
  ['random', 'Math.random вместо сеяного PRNG', 'тот же сид'],
];

if (process.argv.includes('--self')) {
  process.exit(await selfTest({
    title: 'collide-check — осязаемость мира',
    fixture: 'tools/fixture-collide.js',
    mutations: MUTATIONS,
    runOnce,
  }));
} else {
  const problems = await runOnce(arg('mod', 'src/player/collide.js'));
  if (problems.length) {
    console.log('');
    for (const p of problems) console.log('  x ' + p);
    console.log('');
    console.log('COLLIDE_FAIL');
    process.exit(1);
  }
  console.log('COLLIDE_OK');
}
