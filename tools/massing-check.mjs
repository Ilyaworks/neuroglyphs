// Проверяет массу здания: src/world/massing.js.
//
//   node tools/massing-check.mjs
//   node tools/massing-check.mjs --mod tools/fixture-massing.js
//   node tools/massing-check.mjs --self
//
// Слова человека 27.08.2026: «всё выглядит как коробки, а не как город, где здание из
// здания вытекает, нет ни арок, ничего».
//
// Проверка вида «модуль вернул пять коробок» этого не стережёт. Её проходит и пять
// коробок, поставленных рядом (тогда это пять зданий, а не одно), и пять коробок,
// заполняющих один параллелепипед (тогда силуэт снова коробка), и арка, упирающаяся
// в стену (тогда это ниша, а не проход). Здесь мерятся свойства результата.
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

const PLAYER = 18;
const PARTS_MIN = 3, PARTS_MAX = 9;
// Доля стыка считается от МЕНЬШЕЙ из двух частей, а не от своей. Иначе высокая башня,
// прочно сидящая в подиуме, выходит «одинокой»: её объём велик, стык мал, доля мизерна —
// и гейт объявляет сросшееся здание тремя отдельными.
const FUSE_MIN = 0.15;
const FILL_MAX = 0.65;      // объём массы к объёму её габаритной коробки
const SHIFT_MIN = 0.15;     // сдвиг верхней части от середины подиума, доля ширины
const TOPS_MIN = 3;         // сколько разных высот верхних граней
const OPEN_W = PLAYER * 3;  // ширина проёма
const OPEN_H = PLAYER * 2.5;
const OPEN_TOP = 0.4;       // верх проёма не выше этой доли высоты массы
const BRIDGE_SHARE = 0.3;   // доля зданий с мостом на выборке сидов
const SEEDS = 200;
const OUT_MAX = 0.05;       // насколько масса вправе выйти за габарит участка

const STUB_LANGUAGE = {
  manner: 'stub', alphabet: ['greek'], glyphs: [0, 1, 2, 3],
  forms: ['slab', 'arch', 'dome'], density: 0.5,
  proportion: { aspect: 0.5, thickness: 0.5, curvature: 0.5, taper: 0.5, spacing: 0.5 },
  markWeights: {},
  variantOf(form) {
    return { form, count: 60, size: 1, aspect: 0.5, thickness: 0.5, curvature: 0.5, taper: 0.5,
      fill(i, out) { out[0] = (i % 5) * 8 - 16; out[1] = (i % 17) * 6; out[2] = (i % 3) * 8 - 8; return out; } };
  },
};

const areaFor = (id, cx, cz) => ({
  id, kind: 'street', rule: 'grid',
  center: [cx, 0, cz], size: [284, 240, 284], floorY: 0,
});

const vol = (b) => Math.max(0, b.max[0] - b.min[0]) * Math.max(0, b.max[1] - b.min[1])
  * Math.max(0, b.max[2] - b.min[2]);

function inter(a, b) {
  const min = [0, 0, 0], max = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    min[k] = Math.max(a.min[k], b.min[k]);
    max[k] = Math.min(a.max[k], b.max[k]);
    if (max[k] <= min[k]) return 0;
  }
  return vol({ min, max });
}

// Перекрывает ли коробка проём по его оси. Проём — это дыра НАСКВОЗЬ: если по линии
// прохода стоит часть массы, арка превращается в нишу, и войти в неё можно, а выйти нет.
function blocksOpening(box, op, bounds) {
  const half = op.width / 2;
  const lo = op.center[1] + 1, hi = op.center[1] + op.height - 1;
  if (box.max[1] <= lo || box.min[1] >= hi) return false;
  if (op.axis === 'z') {
    if (box.max[0] <= op.center[0] - half || box.min[0] >= op.center[0] + half) return false;
    // Тянемся вдоль z через всю массу: любая часть на пути — заслонка
    return box.max[2] > bounds.min[2] && box.min[2] < bounds.max[2];
  }
  if (box.max[2] <= op.center[2] - half || box.min[2] >= op.center[2] + half) return false;
  return box.max[0] > bounds.min[0] && box.min[0] < bounds.max[0];
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
  if (typeof mod.buildMassing !== 'function') return ['нет buildMassing(seed, language, area, opts)'];

  const area = areaFor(0, 0, 0);
  const neighbours = [[330, 0, 0], [0, 0, -330]];
  let m;
  try { m = mod.buildMassing('TEST-TEST-TEST', STUB_LANGUAGE, area, { neighbours }); }
  catch (e) { return ['buildMassing упал: ' + e.message]; }
  if (!m || !Array.isArray(m.parts)) return ['buildMassing вернул пустое'];

  for (const p of m.parts) {
    if (!Array.isArray(p.min) || !Array.isArray(p.max)
      || !p.min.every(Number.isFinite) || !p.max.every(Number.isFinite)) {
      bad('среди координат части есть не-числа');
      break;
    }
  }
  if (problems.length) return problems;

  // 1. Масса не одна коробка
  say('частей в массе: ' + m.parts.length + ' (нужно ' + PARTS_MIN + '..' + PARTS_MAX + ')');
  if (m.parts.length < PARTS_MIN || m.parts.length > PARTS_MAX) {
    bad('частей в массе ' + m.parts.length + ', нужно ' + PARTS_MIN + '..' + PARTS_MAX
      + '. Одна коробка — это ровно то, что человек назвал кубиком');
  }
  if (problems.length) return problems;

  // 2. Части СРОСЛИСЬ и масса связна
  {
    const n = m.parts.length;
    const adj = Array.from({ length: n }, () => []);
    let lonely = 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const o = inter(m.parts[i], m.parts[j])
          / Math.max(1e-6, Math.min(vol(m.parts[i]), vol(m.parts[j])));
        if (o >= FUSE_MIN) adj[i].push(j);
        if (o > best) best = o;
      }
      if (!adj[i].length) lonely++;
    }
    const seen = new Set([0]);
    const st = [0];
    while (st.length) {
      const u = st.pop();
      for (const v of adj[u]) if (!seen.has(v)) { seen.add(v); st.push(v); }
    }
    say('сросшихся: связано ' + seen.size + ' частей из ' + n + ', одиноких ' + lonely);
    if (lonely || seen.size !== n) {
      bad('масса не срослась: ' + lonely + ' частей ни с чем не пересекаются, связано '
        + seen.size + ' из ' + n + '. Это несколько зданий рядом, а не одно, из которого '
        + 'вытекает другое');
    }
  }

  // 3. Силуэт не коробка
  {
    let filled = 0;
    for (let i = 0; i < m.parts.length; i++) {
      filled += vol(m.parts[i]);
      for (let j = 0; j < i; j++) filled -= inter(m.parts[i], m.parts[j]);
    }
    const box = vol(m.bounds || { min: [0, 0, 0], max: [0, 0, 0] });
    const ratio = box > 0 ? filled / box : 1;
    say('заполнение габарита: ' + ratio.toFixed(2) + ' (не больше ' + FILL_MAX + ')');
    if (ratio > FILL_MAX) {
      bad('масса заполняет свой габарит на ' + (ratio * 100).toFixed(0)
        + '% при пороге ' + (FILL_MAX * 100) + '%: силуэт снова параллелепипед. Уступы, '
        + 'сдвиги и крылья на то и нужны, чтобы силуэт был рваным');
    }
  }

  // 4. Верхняя часть сдвинута, высоты ступенями
  {
    // Сдвиг мерится от середины ВСЕГО здания, а не от какой-то нижней части. Подиум
    // бывает разрезан проёмом надвое, и «самая нижняя часть» тогда оказывается одной
    // из половин — её середина сама смещена, и башня по центру выглядела сдвинутой.
    const byTop = m.parts.slice().sort((a, b) => b.max[1] - a.max[1]);
    const top = byTop[0];
    const cx = (m.bounds.min[0] + m.bounds.max[0]) / 2;
    const cz = (m.bounds.min[2] + m.bounds.max[2]) / 2;
    const baseW = Math.max(1, m.bounds.max[0] - m.bounds.min[0]);
    const dx = Math.abs((top.min[0] + top.max[0]) / 2 - cx);
    const dz = Math.abs((top.min[2] + top.max[2]) / 2 - cz);
    const shift = Math.max(dx, dz) / baseW;
    say('сдвиг верхней части: ' + shift.toFixed(2) + ' ширины здания (нужно ' + SHIFT_MIN + ')');
    if (shift < SHIFT_MIN) {
      bad('верхняя часть стоит по центру здания (сдвиг ' + shift.toFixed(2)
        + ' при пороге ' + SHIFT_MIN + '): выходит ступенчатая пирамида, а не здание');
    }
    const tops = new Set(m.parts.map((p) => Math.round(p.max[1] / 4)));
    say('разных высот верхних граней: ' + tops.size + ' (нужно ' + TOPS_MIN + ')');
    if (tops.size < TOPS_MIN) {
      bad('разных высот верхних граней всего ' + tops.size + ' при пороге ' + TOPS_MIN
        + ': крыша плоская, и силуэт читается коробкой');
    }
  }

  // 5. Проёмы: есть, проходимы, сквозные и внизу
  {
    const ops = m.openings || [];
    say('проёмов: ' + ops.length);
    if (!ops.length) {
      bad('в массе нет ни одного проёма. «Нет ни арок» — это прямая жалоба человека, '
        + 'и без проёмов город остаётся набором глухих кубиков');
    }
    const H = (m.bounds.max[1] - m.bounds.min[1]) || 1;
    let narrow = 0, high = 0, blocked = 0;
    for (const op of ops) {
      if (!(op.width >= OPEN_W) || !(op.height >= OPEN_H)) narrow++;
      if (op.center[1] + op.height > m.bounds.min[1] + H * OPEN_TOP) high++;
      for (const p of m.parts) {
        if (blocksOpening(p, op, m.bounds)) { blocked++; break; }
      }
    }
    if (narrow) {
      bad('узких проёмов ' + narrow + ': нужно от ' + OPEN_W + ' в ширину и ' + OPEN_H
        + ' в высоту, это три роста и два с половиной. В такой не пройти');
    }
    if (high) {
      bad('проёмов не на уровне улицы ' + high + ': верх выше ' + (OPEN_TOP * 100)
        + '% высоты массы. Арка нужна там, где ходят, а не под крышей');
    }
    say('проёмов, перекрытых частью массы: ' + blocked);
    if (blocked) {
      bad('проём перекрыт частью массы (' + blocked + ' шт.): это ниша, а не проход. '
        + 'Сквозь арку обязано быть видно следующую улицу');
    }
  }

  // 6. Масса не вылезает из своего участка
  {
    let out = 0;
    for (const p of m.parts) {
      for (const k of [0, 2]) {
        const lo = area.center[k] - area.size[k] / 2, hi = area.center[k] + area.size[k] / 2;
        const slack = area.size[k] * OUT_MAX;
        if (p.min[k] < lo - slack || p.max[k] > hi + slack) { out++; break; }
      }
    }
    say('частей вне участка: ' + out);
    if (out) {
      bad(out + ' частей массы вылезают за габарит участка больше чем на '
        + (OUT_MAX * 100) + '%: здания налезут на улицу и друг на друга');
    }
  }

  // 7. Мосты: у трети зданий на выборке сидов
  {
    let withBridge = 0, ok = 0, hanging = 0;
    for (let i = 0; i < SEEDS; i++) {
      const seed = 'M' + i + '-' + ((i * 40503) % 65521);
      const a = areaFor(i % 7, 0, 0);
      let mm;
      try { mm = mod.buildMassing(seed, STUB_LANGUAGE, a, { neighbours }); }
      catch (e) { bad('buildMassing упал на сиде ' + seed + ': ' + e.message); break; }
      if (!mm) continue;
      ok++;
      const br = mm.bridges || [];
      if (br.length) withBridge++;
      for (const b of br) {
        const insideMass = (pt) => (mm.parts || []).some((p) =>
          pt[0] >= p.min[0] - 2 && pt[0] <= p.max[0] + 2
          && pt[2] >= p.min[2] - 2 && pt[2] <= p.max[2] + 2
          && pt[1] >= p.min[1] - 2 && pt[1] <= p.max[1] + 2);
        if (!insideMass(b.from)) hanging++;
      }
    }
    if (ok) {
      const share = withBridge / ok;
      say('зданий с мостом: ' + (share * 100).toFixed(0) + '% из ' + ok
        + ' (нужно от ' + (BRIDGE_SHARE * 100) + '%), концов в воздухе ' + hanging);
      if (share < BRIDGE_SHARE) {
        bad('мост есть только у ' + (share * 100).toFixed(0) + '% зданий при пороге '
          + (BRIDGE_SHARE * 100) + '%: без переходов город снова рассыпается на кубики');
      }
      if (hanging) {
        bad('концов моста в воздухе ' + hanging + ': мост обязан начинаться внутри массы, '
          + 'а не висеть рядом с ней');
      }
    }
  }

  // 8. Детерминизм — проверяется всегда
  try {
    const dump = (seed) => JSON.stringify((mod.buildMassing(seed, STUB_LANGUAGE, area, { neighbours }).parts || [])
      .map((p) => [p.kind, p.min.map(Math.round), p.max.map(Math.round)]));
    const a = dump('SEED-AAAA-1111'), b = dump('SEED-AAAA-1111'), c = dump('SEED-BBBB-2222');
    say('тот же сид даёт ту же массу: ' + (a === b));
    if (a !== b) bad('тот же сид даёт другую массу — нарушен инвариант 1');
    if (a === c) bad('другой сид даёт ту же массу — сид ни на что не влияет');
  } catch (e) {
    bad('проверка детерминизма упала: ' + e.message);
  }

  return problems;
}

const MUTATIONS = [
  ['onebox', 'масса из одной коробки', 'частей в массе'],
  ['apart', 'части не пересекаются', 'не срослась'],
  ['boxy', 'масса заполняет свой габарит', 'заполняет свой габарит'],
  ['centered', 'верхняя часть не сдвинута', 'по центру здания'],
  ['noarch', 'проёмов нет', 'нет ни одного проёма'],
  ['blocked', 'проём перекрыт частью массы', 'это ниша'],
  ['nobridge', 'мостов нет ни у кого', 'мост есть только у'],
  ['random', 'Math.random вместо сеяного PRNG', 'тот же сид'],
];

if (process.argv.includes('--self')) {
  process.exit(await selfTest({
    title: 'massing-check — масса вместо коробки',
    fixture: 'tools/fixture-massing.js',
    mutations: MUTATIONS,
    runOnce,
  }));
} else {
  const problems = await runOnce(arg('mod', 'src/world/massing.js'));
  if (problems.length) {
    console.log('');
    for (const p of problems) console.log('  x ' + p);
    console.log('');
    console.log('MASSING_FAIL');
    process.exit(1);
  }
  console.log('MASSING_OK');
}
