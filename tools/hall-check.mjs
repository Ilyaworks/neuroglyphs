// Проверяет зал со сферой: src/world/halls.js.
//
//   node tools/hall-check.mjs
//   node tools/hall-check.mjs --mod tools/fixture-hall.js
//   node tools/hall-check.mjs --self
//
// Зал — вертикальный срез по кадру референса, выбранному человеком 27.08.2026:
// монохромный зал со сферой. Через него проходит вся цепочка проекта, и если где-то
// тонко, это выяснится здесь, а не на десятой локации.
//
// Гейт мерит ГЕОМЕТРИЮ: замкнутость, зеркальность аркад, сферу на оси и на виду,
// шахматный пол, свободный неф. Про готовый кадр — тёмную середину и один тон — здесь
// нет ничего намеренно: это замер картинки, ему нужен браузер, и самопроверка на
// эталоне для него невозможна. Смешивать одно с другим значит получить медленный гейт,
// которому нельзя доверять ни в одной половине.
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

const MIRROR_DEV = 0.03;   // насколько левая аркада вправе отличаться от правой
const AXIS_DEV = 0.04;     // насколько центр сферы вправе отойти от оси зала
const PERIM_MIN = 0.9;     // какая доля периметра обязана быть закрыта стеной или проёмом
const NAVE_MIN = 3;        // ширина нефа в ростах игрока
const PLAYER = 18;         // рост игрока в единицах мира
const CELLS_MIN = 6;       // клеток шахматного пола вдоль короткой стороны

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

// Заглушка языка. Зал БЕЗ языка бессмыслен — он собирается из форм города, — поэтому
// гейт обязан язык подать. Подаёт он свой, простейший: так проверка не тянет за собой
// language.js и меряет зал, а не язык.
const STUB_LANGUAGE = {
  manner: 'stub',
  alphabet: ['greek'],
  glyphs: Array.from({ length: 49 }, (_, i) => i),
  forms: ['slab', 'arch', 'dome'],
  proportion: { aspect: 0.5, thickness: 0.5, curvature: 0.5, taper: 0.5, spacing: 0.5 },
  density: 0.5,
  markWeights: {},
  variantOf(form) {
    const count = 240;
    return {
      form, count, size: 1, aspect: 0.5, thickness: 0.5, curvature: 0.5, taper: 0.5,
      fill(i, out) {
        const face = i % 4;
        const t = ((i * 7919) % 997) / 997;
        const u = ((i * 104729) % 991) / 991;
        const w = 30, h = 120, d = 30;
        out[0] = face === 0 ? (t - 0.5) * 2 * w : face === 1 ? (t - 0.5) * 2 * w : (face === 2 ? w : -w);
        out[2] = face === 0 ? d : face === 1 ? -d : (t - 0.5) * 2 * d;
        out[1] = u * h;
        return out;
      },
    };
  },
};

// Пересекает ли отрезок вертикальную прямоугольную стену. Стена задана началом и двумя
// осями; нам довольно её следа на плане — зал стоит на полу, стены отвесны.
function crossesWall(a, b, wall) {
  const o = wall.origin, u = wall.u;
  const ux = u[0] * wall.w, uz = u[2] * wall.w;
  const px = a[0], pz = a[2], rx = b[0] - a[0], rz = b[2] - a[2];
  const qx = o[0], qz = o[2], sx = ux, sz = uz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((qx - px) * sz - (qz - pz) * sx) / den;
  const w = ((qx - px) * rz - (qz - pz) * rx) / den;
  return t > 0.01 && t < 0.99 && w > 0 && w < 1;
}

// Стоит ли точка внутри следа колонны на плане.
function insideColumn(x, z, col, foot) {
  const c = Math.cos(col.turn || 0), s = Math.sin(col.turn || 0);
  const dx = x - col.at[0], dz = z - col.at[2];
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  return Math.abs(lx) <= foot[0] * col.scale * 0.5 && Math.abs(lz) <= foot[2] * col.scale * 0.5;
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
  if (typeof mod.buildHall !== 'function') return ['нет buildHall(seed, language, opts)'];

  let h;
  try { h = mod.buildHall('TEST-TEST-TEST', STUB_LANGUAGE, {}); }
  catch (e) { return ['buildHall упал: ' + e.message]; }
  if (!h) return ['buildHall вернул пустое'];

  for (const f of ['bounds', 'axis', 'eye', 'columns', 'sphere', 'walls', 'gates', 'floorPlan', 'element']) {
    if (h[f] === undefined) bad('в зале нет поля ' + f);
  }
  if (problems.length) return problems;

  const foot = h.element.footprint;
  const width = h.bounds.max[0] - h.bounds.min[0];
  const depth = h.bounds.max[2] - h.bounds.min[2];

  // 1. Зал ЗАМКНУТ. Пускаем лучи из середины во все стороны: каждый обязан упереться
  //    в стену или уйти в объявленный проём. Луч, вышедший в чистое поле, — это дыра,
  //    и через неё зал перестаёт быть залом.
  {
    const cx = (h.bounds.min[0] + h.bounds.max[0]) / 2;
    const cz = (h.bounds.min[2] + h.bounds.max[2]) / 2;
    const R = Math.hypot(width, depth);
    let closed = 0;
    const N = 120;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const far = [cx + Math.cos(a) * R, h.floorY, cz + Math.sin(a) * R];
      let hitWall = h.walls.some((w) => crossesWall([cx, h.floorY, cz], far, w));
      if (!hitWall) {
        // Проём засчитывается: через него и выходят наружу
        hitWall = (h.gates || []).some((g) => {
          const dx = g.center[0] - cx, dz = g.center[2] - cz;
          const ang = Math.atan2(dz, dx);
          const halfAng = Math.atan2(g.width / 2, Math.max(1, Math.hypot(dx, dz)));
          let d = Math.abs(((a - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          return d <= halfAng;
        });
      }
      if (hitWall) closed++;
    }
    const share = closed / N;
    say('замкнутость: закрыто ' + (share * 100).toFixed(0) + '% направлений (нужно '
      + (PERIM_MIN * 100) + '%)');
    if (share < PERIM_MIN) {
      bad('зал не замкнут: в ' + ((1 - share) * 100).toFixed(0)
        + '% направлений нет ни стены, ни проёма. Через такую дыру зал перестаёт быть залом');
    }
  }

  // 2. Аркады зеркальны относительно оси зала
  {
    const axisX = (h.axis.from[0] + h.axis.to[0]) / 2;
    let unmatched = 0;
    for (const c of h.columns) {
      const want = 2 * axisX - c.at[0];
      const twin = h.columns.find((q) => Math.abs(q.at[0] - want) < width * MIRROR_DEV
        && Math.abs(q.at[2] - c.at[2]) < width * MIRROR_DEV
        && Math.abs(q.scale - c.scale) < 0.05);
      if (!twin) unmatched++;
    }
    say('зеркальность: без пары ' + unmatched + ' колонн из ' + h.columns.length);
    if (unmatched) {
      bad('аркады не зеркальны: ' + unmatched + ' колонн из ' + h.columns.length
        + ' не имеют отражения. Зал симметричен относительно своей оси — это его признак');
    }
  }

  // 3. Сфера на оси и на виду из точки входа
  {
    const axisX = (h.axis.from[0] + h.axis.to[0]) / 2;
    const off = Math.abs(h.sphere.center[0] - axisX) / Math.max(1, width);
    say('сфера: отход от оси ' + off.toFixed(3) + ' ширины (допуск ' + AXIS_DEV + ')');
    if (off > AXIS_DEV) {
      bad('сфера ушла с оси на ' + (off * 100).toFixed(0) + '% ширины зала при допуске '
        + (AXIS_DEV * 100) + '%. Она предмет кадра, и стоит она посередине');
    }
    if (!(h.sphere.radius > 0)) bad('у сферы нет радиуса');

    const blockedByWall = h.walls.some((w) => crossesWall(h.eye, h.sphere.center, w));
    const steps = 40;
    let blockedByColumn = false;
    for (let i = 1; i < steps && !blockedByColumn; i++) {
      const t = i / steps;
      const x = h.eye[0] + (h.sphere.center[0] - h.eye[0]) * t;
      const z = h.eye[2] + (h.sphere.center[2] - h.eye[2]) * t;
      if (h.columns.some((c) => insideColumn(x, z, c, foot))) blockedByColumn = true;
    }
    say('сферу видно из точки входа: ' + (!blockedByWall && !blockedByColumn));
    if (blockedByWall || blockedByColumn) {
      bad('сферу не видно из точки входа: её загораживает '
        + (blockedByWall ? 'стена' : 'колонна') + '. Предмет кадра обязан быть виден');
    }
  }

  // 4. Сфера объявлена ПОВЕРХНОСТЬЮ: знаки лежат на оболочке, а не набивают объём
  {
    const s = (h.surfaces || []).find((x) => x.spec && x.spec.type === 'sphere');
    say('сфера объявлена поверхностью: ' + !!s);
    if (!s) {
      bad('сфера не объявлена поверхностью со знаками: без этого она будет набита точками '
        + 'внутри, а на кадре она покрыта знаками СНАРУЖИ');
    }
  }

  // 5. Пол шахматный
  {
    const fp = h.floorPlan;
    const short = Math.min(fp.w, fp.h);
    const cells = fp.cell > 0 ? short / fp.cell : 0;
    say('пол: клеток вдоль короткой стороны ' + cells.toFixed(1) + ' (нужно ' + CELLS_MIN + ')');
    if (!(fp.cell > 0) || cells < CELLS_MIN) {
      bad('пол не шахматный: клеток вдоль короткой стороны ' + cells.toFixed(1)
        + ' при пороге ' + CELLS_MIN + '. На кадре пол расчерчен, и по нему читается глубина');
    }
  }

  // 6. Неф свободен и не уже трёх ростов
  {
    const half = h.naveHalfWidth || 0;
    say('неф: полуширина ' + half.toFixed(0) + ' единиц, это ' + (half * 2 / PLAYER).toFixed(1) + ' ростов');
    if (half * 2 < PLAYER * NAVE_MIN) {
      bad('неф уже ' + NAVE_MIN + ' ростов: пройти по залу не выйдет');
    }
    let inNave = 0;
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const z = h.axis.from[2] + (h.axis.to[2] - h.axis.from[2]) * t;
      for (const c of h.columns) {
        if (insideColumn(0, z, c, foot)) { inNave++; break; }
      }
    }
    say('неф свободен: ' + (inNave === 0) + (inNave ? ' (перекрыт в ' + inNave + ' точках)' : ''));
    if (inNave) {
      bad('неф перекрыт колонной в ' + inNave + ' точках из ' + (steps + 1)
        + ': пройти зал насквозь нельзя, а он для того и есть');
    }
  }

  // 7. Детерминизм — проверяется всегда
  try {
    const dump = (seed) => {
      const x = mod.buildHall(seed, STUB_LANGUAGE, {});
      return JSON.stringify([x.columns.map((c) => [c.at.map((v) => Math.round(v)), Math.round(c.scale * 100)]),
        x.sphere.center.map((v) => Math.round(v))]);
    };
    const a = dump('SEED-AAAA-1111'), b = dump('SEED-AAAA-1111'), c = dump('SEED-BBBB-2222');
    say('тот же сид даёт тот же зал: ' + (a === b));
    if (a !== b) bad('тот же сид даёт другой зал — нарушен инвариант 1');
    if (a === c) bad('другой сид даёт тот же зал — сид ни на что не влияет');
  } catch (e) {
    bad('проверка детерминизма упала: ' + e.message);
  }

  return problems;
}

const MUTATIONS = [
  ['open', 'у зала нет одной стены', 'не замкнут'],
  ['lopsided', 'правая аркада сдвинута', 'не зеркальны'],
  ['offcenter', 'сфера уехала с оси', 'ушла с оси'],
  ['blocked', 'колонна встала посреди нефа', 'неф перекрыт'],
  ['plainfloor', 'пол без шахматной клетки', 'не шахматный'],
  ['hidden', 'сферу загородили перегородкой', 'не видно из точки входа'],
  ['random', 'Math.random вместо сеяного PRNG', 'тот же сид'],
];

if (process.argv.includes('--self')) {
  process.exit(await selfTest({
    title: 'hall-check — зал со сферой',
    fixture: 'tools/fixture-hall.js',
    mutations: MUTATIONS,
    runOnce,
  }));
} else {
  const problems = await runOnce(arg('mod', 'src/world/halls.js'));
  if (problems.length) {
    console.log('');
    for (const p of problems) console.log('  x ' + p);
    console.log('');
    console.log('HALL_FAIL');
    process.exit(1);
  }
  console.log('HALL_OK');
}
