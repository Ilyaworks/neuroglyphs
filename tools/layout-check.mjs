// Проверка раскладок из src/world/layouts/: детерминизм, чистота и способность
// наполнить мир заданным числом точек.
//
//   node tools/layout-check.mjs
//
// Зачем: у N12 проверка была `Object.keys(m).length` — счёт экспортов. Раскладка,
// которая возвращает 260 точек при поле на 23500 и не умеет уплотняться ни одним
// параметром, проходит такую проверку молча.
//
// Инструмент сам находит все модули в src/world/layouts/, поэтому N13 и N14 попадут
// под него без правок.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// --dir <путь> нужен только для проверки самого инструмента на эталоне
// tools/fixture-layouts: инструмент, который не проходит ни на чём, ничего не проверяет.
const dirArg = (() => {
  const i = process.argv.indexOf('--dir');
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1].replace(/^[/]/, '') : null;
})();
const DIR = dirArg || 'src/world/layouts';

// Контракт: раскладка обязана уметь выдать примерно столько точек, сколько попросили,
// потому что плотность поля берётся из сида и меняется от мира к миру.
const TARGETS = [1500, 5000, 20000, 31500];
const TOLERANCE = 0.30;
// Размер. `params.extent` — радиус объёма, который раскладка должна заполнить, то есть
// максимальное удаление точки от центра. Поле в мире имеет радиус 400, поэтому это и
// значение по умолчанию. Два требования: раскладка слушается extent, и размер не зависит
// от плотности — цель меняет число точек, а не габарит.
const EXTENTS = [200, 400];
const EXTENT_BAND = [0.6, 1.5];
const EXTENT_DRIFT_MAX = 0.15;
// Попадание в полосу ещё не значит, что extent слушают: раскладка с фиксированным
// размером может случайно попасть в допуск на обоих значениях. Поэтому отдельно
// требуем, чтобы габарит следил за заказом — при удвоении extent он обязан удвоиться.
const TRACK_BAND = [1.5, 2.5];
// Порядок раскладок в LAYOUTS из index.js — это отображение поля `structure` сида в
// форму мира, таблица ID лежит в N14. Порядок здесь дублируется намеренно: если он
// разъедется с планом, сид начнёт выбирать не тот мир, и заметить это по картинке
// почти невозможно. Проверяется только когда index.js уже существует.
// Невидимые точки. Размер точки на экране считает шейдер в src/world/fieldMaterial.js:
// gl_PointSize = size * (1 + 0.5 * uPulse) * (300 / глубина). При среднем uPulse 0.5 и
// глубине, равной extent, это size * 1.25 * (300 / extent). Точка мельче пикселя не
// рисуется вовсе, то есть съедает бюджет впустую. Если формула в шейдере поменяется,
// поменять и здесь.
const SHADER_SIZE_BASE = 300;
const SHADER_PULSE_MID = 1.25;
const TINY_SHARE_MAX = 0.05;

const EXPECTED_ORDER = [
  'layoutFractalCorridors',
  'layoutNonEuclidean',
  'layoutCrystalline',
  'layoutOrganic',
  'layoutGeometric',
  'layoutAlmostReal',
  'layoutVoid',
  'layoutCrossedWorlds',
];
// Сидов несколько не для красоты: у раскладки с ветвящимся деревом отклонение зависит
// от формы дерева, и на одном сиде проверка проходила, пока каждый шестой сид выходил
// за допуск. Требуем допуск на всех сидах и печатаем худший.
// Сидов именно много: на восьми проверка проходила, пока прогон на шестидесяти
// показывал, что каждый шестой сид выходит за допуск. Хвост распределения надо
// сэмплировать, иначе гейт зелёный по случайности выборки.
const SEEDS = Array.from({ length: 24 }, (_, i) => (i + 1) * 7919);
const SEED_OTHER = 12346;

const problems = [];
const rows = [];

if (!fs.existsSync(DIR)) {
  console.error('ПРОВАЛ: нет каталога ' + DIR);
  process.exit(1);
}

const rngMod = await import(pathToFileURL(path.resolve('src/core/rng.js')).href);
const files = fs.readdirSync(DIR).filter(f => /\.m?js$/.test(f));
if (!files.length) {
  console.error('ПРОВАЛ: в ' + DIR + ' нет модулей');
  process.exit(1);
}

function hash(arr) {
  let x = 2166136261;
  for (let i = 0; i < arr.length; i++) {
    x ^= Math.round(arr[i] * 1000) | 0;
    x = Math.imul(x, 16777619) >>> 0;
  }
  return x >>> 0;
}

function halfSpan(res) {
  let m = 0;
  for (let i = 0; i < res.count; i++) {
    for (let k = 0; k < 3; k++) {
      const v = Math.abs(res.positions[i * 3 + k]);
      if (v > m) m = v;
    }
  }
  return m;
}

function tinyShare(res, extent) {
  const pxPerScale = SHADER_PULSE_MID * (SHADER_SIZE_BASE / extent);
  let tiny = 0;
  for (let i = 0; i < res.count; i++) {
    if (res.scales[i] * pxPerScale < 1) tiny++;
  }
  return res.count ? tiny / res.count : 0;
}

function radialProfile(res) {
  const n = res.count, p = res.positions;
  const rad = new Float64Array(n);
  let maxR = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    rad[i] = d;
    if (d > maxR) maxR = d;
  }
  const shells = new Array(8).fill(0);
  for (let i = 0; i < n; i++) {
    shells[Math.min(7, Math.floor((rad[i] / (maxR || 1)) * 8))]++;
  }
  return shells.map(v => (n ? v / n : 0));
}

function signature(res) {
  const p = res.positions;
  const n = res.count;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const mean = [0, 0, 0];
  let nonFinite = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const v = p[i * 3 + k];
      if (!Number.isFinite(v)) { nonFinite++; continue; }
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
      mean[k] += v / n;
    }
  }
  const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const varr = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const d = p[i * 3 + k] - mean[k];
      varr[k] += (d * d) / n;
    }
  }
  const anisotropy = Math.min(...varr) > 0 ? Math.max(...varr) / Math.min(...varr) : Infinity;
  const G = 16;
  const cells = new Set();
  for (let i = 0; i < n; i++) {
    let key = 0;
    for (let k = 0; k < 3; k++) {
      const s = span[k] || 1;
      key = key * G + Math.min(G - 1, Math.max(0, Math.floor(((p[i * 3 + k] - min[k]) / s) * G)));
    }
    cells.add(key);
  }
  let sMin = Infinity, sMax = -Infinity, badScale = 0;
  for (let i = 0; i < n; i++) {
    const s = res.scales[i];
    if (!Number.isFinite(s) || s <= 0) badScale++;
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
  }
  return {
    nonFinite, badScale, span, anisotropy,
    occupancy: cells.size / (G * G * G),
    scaleMin: sMin, scaleMax: sMax,
  };
}

const positionHashes = new Map();
const seenFns = new Set();
const tinyRows = [];
const profiles = [];
const extentRows = [];
const driftRows = [];

for (const file of files) {
  const rel = DIR + '/' + file;
  const src = fs.readFileSync(rel, 'utf8');
  if (/Math\.random\s*\(/.test(src)) {
    problems.push(rel + ': найден Math.random() — генерация обязана идти только от сеяного rng');
  }
  if (/from\s*['"]three['"]/.test(src)) {
    problems.push(rel + ': импортирует three — раскладки обязаны быть чистыми функциями без рендера');
  }

  const mod = await import(pathToFileURL(path.resolve(rel)).href);

  // index.js отдаёт массив LAYOUTS, а не функции. Порядок в нём — это отображение
  // поля structure сида в форму мира, поэтому сверяем с таблицей ID из N14.
  const arrays = Object.entries(mod).filter(([, v]) => Array.isArray(v));
  for (const [arrName, arr] of arrays) {
    console.log(rel + ': массив ' + arrName + ' из ' + arr.length + ' элементов');
    const notFn = arr.filter(v => typeof v !== 'function').length;
    if (notFn) problems.push(rel + ': в ' + arrName + ' не функций: ' + notFn);
    const uniq = new Set(arr);
    if (uniq.size !== arr.length) {
      problems.push(rel + ': в ' + arrName + ' повторяются раскладки — ' + arr.length +
        ' элементов, различных ' + uniq.size + '. Один и тот же ID сида будет давать ' +
        'два разных мира одной формы.');
    }
    if (arrName === 'LAYOUTS') {
      if (arr.length !== EXPECTED_ORDER.length) {
        problems.push(rel + ': LAYOUTS длиной ' + arr.length + ', ожидалось ' +
          EXPECTED_ORDER.length + ' — по одной раскладке на значение поля structure сида');
      }
      arr.forEach((fn, i) => {
        const want = EXPECTED_ORDER[i];
        if (want && typeof fn === 'function' && fn.name !== want) {
          problems.push(rel + ': LAYOUTS[' + i + '] это ' + (fn.name || 'безымянная функция') +
            ', а по таблице ID из N14 там должна быть ' + want +
            '. Сид выберет не ту форму мира.');
        }
      });
    }
  }

  const fns = Object.entries(mod).filter(([, v]) => typeof v === 'function');
  if (!fns.length && !arrays.length) problems.push(rel + ': нет экспортированных функций');

  for (const [name, fn] of fns) {
    // Одна и та же функция может прийти из своего модуля и из реэкспорта в index.js —
    // мерить её дважды незачем, а по хешу позиций она иначе выглядит как дубль.
    if (seenFns.has(fn)) continue;
    seenFns.add(fn);
    for (const target of TARGETS) {
      let res;
      const offs = [];
      let crashed = false;
      for (const seed of SEEDS) {
        let r;
        try {
          r = fn(rngMod.mulberry32(seed), { target });
        } catch (e) {
          problems.push(name + ' (target ' + target + ', сид ' + seed + '): упала — ' + e.message);
          crashed = true;
          break;
        }
        if (!r || typeof r.count !== 'number') continue;
        offs.push({ seed, off: Math.abs(r.count - target) / target, count: r.count });
        if (seed === SEEDS[0]) res = r;
      }
      if (crashed) continue;
      if (!res || !res.positions || !res.scales || typeof res.count !== 'number') {
        problems.push(name + ': вернула не { positions, scales, count }');
        continue;
      }
      if (res.positions.length !== res.count * 3) {
        problems.push(name + ': positions длиной ' + res.positions.length + ' при count ' + res.count);
      }
      if (res.scales.length !== res.count) {
        problems.push(name + ': scales длиной ' + res.scales.length + ' при count ' + res.count);
      }

      const sig = signature(res);
      const off = target > 0 ? Math.abs(res.count - target) / target : 1;
      const sorted = offs.slice().sort((x, y) => x.off - y.off);
      const median = sorted.length ? sorted[Math.floor(sorted.length / 2)].off : 1;
      const worst = sorted.length ? sorted[sorted.length - 1] : { off: 1, seed: 0, count: 0 };
      rows.push({ name, target, count: res.count, off, median, worst, seeds: offs.length, sig });

      if (sig.nonFinite) problems.push(name + ': нечисловых координат ' + sig.nonFinite);
      if (sig.badScale) problems.push(name + ': неположительных scale ' + sig.badScale);
      if (!(sig.span[0] > 0 && sig.span[1] > 0 && sig.span[2] > 0)) {
        problems.push(name + ': габарит вырожден — ' + sig.span.map(v => v.toFixed(1)).join('x') +
          ', все точки лежат в плоскости или в одной точке');
      }
      const outside = offs.filter(o => o.off > TOLERANCE);
      if (outside.length) {
        problems.push(name + ': на цели ' + target + ' допуск ' + (TOLERANCE * 100) + '% нарушен на ' +
          outside.length + ' сидах из ' + offs.length + ', худший — сид ' + worst.seed +
          ' дал ' + worst.count + ' вместо ' + target + ' (отклонение ' +
          (worst.off * 100).toFixed(0) + '%). Плотность поля берётся из сида, поэтому ' +
          'раскладка обязана держать цель на любом сиде, а не в среднем.');
      }

      if (target === TARGETS[TARGETS.length - 1]) {
        // Слушается ли extent.
        for (const extent of EXTENTS) {
          const r = fn(rngMod.mulberry32(SEEDS[0]), { target, extent });
          const half = halfSpan(r);
          const ratio = half / extent;
          extentRows.push({ name, extent, half, ratio });
          if (ratio < EXTENT_BAND[0] || ratio > EXTENT_BAND[1]) {
            problems.push(name + ': при extent ' + extent + ' габарит вышел ' + half.toFixed(0) +
              ' от центра, это ' + ratio.toFixed(2) + ' от заказанного при допустимой полосе ' +
              EXTENT_BAND[0] + '..' + EXTENT_BAND[1] + '. Поле в мире радиусом 400, и раскладка ' +
              'обязана слушаться extent, иначе сборка не сможет попросить у неё нужный объём.');
          }
        }
        // Следит ли габарит за заказанным размером, а не просто попал в полосу.
        const small = extentRows[extentRows.length - 2];
        const large = extentRows[extentRows.length - 1];
        if (small && large && small.half > 0) {
          const track = large.half / small.half;
          console.log(name.padEnd(24) + ' при удвоении extent габарит изменился в ' +
            track.toFixed(2) + ' раза (нужно ' + TRACK_BAND[0] + '..' + TRACK_BAND[1] + ')');
          if (track < TRACK_BAND[0] || track > TRACK_BAND[1]) {
            problems.push(name + ': extent удвоили, а габарит изменился в ' + track.toFixed(2) +
              ' раза (' + small.half.toFixed(0) + ' -> ' + large.half.toFixed(0) + '). ' +
              'Значит параметр размера не слушают вовсе, и попадание в полосу — случайность.');
          }
        }

        // Точки, которые на своей же глубине мельче пикселя, бюджет тратят, а на экран
        // не попадают. Один слой раскладок это уже проходил на дальнем поле «звёзд».
        const tiny = tinyShare(res, 400);
        tinyRows.push({ name, tiny });
        if (tiny > TINY_SHARE_MAX) {
          problems.push(name + ': ' + (tiny * 100).toFixed(0) + '% точек мельче пикселя на ' +
            'глубине 400 (порог ' + (TINY_SHARE_MAX * 100) + '%). Такие точки не рисуются ' +
            'вовсе: цель просит N точек, а на экран выходит меньше. Затемнять надо яркостью, ' +
            'а не размером — размер ниже пикселя это не тусклая точка, а отсутствующая.');
        }
        profiles.push({ name, prof: radialProfile(res) });

        // Размер не должен зависеть от плотности.
        const spans = TARGETS.map(t => halfSpan(fn(rngMod.mulberry32(SEEDS[0]), { target: t })));
        const drift = (Math.max(...spans) - Math.min(...spans)) / (Math.max(...spans) || 1);
        driftRows.push({ name, spans, drift });
        if (drift > EXTENT_DRIFT_MAX) {
          problems.push(name + ': габарит зависит от числа точек — по целям ' +
            TARGETS.join('/') + ' он вышел ' + spans.map(v => v.toFixed(0)).join('/') +
            ' (разброс ' + (drift * 100).toFixed(0) + '% при допуске ' +
            (EXTENT_DRIFT_MAX * 100) + '%). Цель задаёт плотность, а не размер: при малой ' +
            'плотности мир не должен съёживаться в комок у камеры.');
        }

        const again = fn(rngMod.mulberry32(SEEDS[0]), { target });
        const other = fn(rngMod.mulberry32(SEED_OTHER), { target });
        const h = hash(res.positions);
        if (hash(again.positions) !== h) {
          problems.push(name + ': тот же сид дал другую раскладку — нарушено правило 7');
        }
        if (hash(other.positions) === h) {
          problems.push(name + ': другой сид дал ту же раскладку — сид не влияет на форму');
        }
        const twin = positionHashes.get(h);
        if (twin) problems.push(name + ' и ' + twin + ' дают побитово одну раскладку');
        else positionHashes.set(h, name);
      }
    }
  }
}

console.log('модулей раскладок: ' + files.length + ' (' + files.join(', ') + ')');
for (const r of rows) {
  console.log(r.name.padEnd(24) + ' target ' + String(r.target).padStart(6) +
    ' -> точек ' + String(r.count).padStart(6) +
    ', отклонение: медиана ' + (r.median * 100).toFixed(0).padStart(3) + '%' +
    ', худшее ' + (r.worst.off * 100).toFixed(0).padStart(3) + '% (сид ' + r.worst.seed + ')' +
    ' на ' + r.seeds + ' сидах' +
    ', габарит ' + r.sig.span.map(v => v.toFixed(0)).join('x').padEnd(15) +
    ', занято вокселей ' + r.sig.occupancy.toFixed(3) +
    ', анизотропия ' + r.sig.anisotropy.toFixed(2) +
    ', scale ' + r.sig.scaleMin.toFixed(2) + '..' + r.sig.scaleMax.toFixed(2));
}

for (const r of extentRows) {
  console.log(r.name.padEnd(24) + ' extent ' + String(r.extent).padStart(4) +
    ' -> габарит ' + r.half.toFixed(0).padStart(5) + ' от центра, это ' + r.ratio.toFixed(2) +
    ' от заказанного (полоса ' + EXTENT_BAND[0] + '..' + EXTENT_BAND[1] + ')');
}
for (const r of driftRows) {
  console.log(r.name.padEnd(24) + ' габарит по целям ' + r.spans.map(v => v.toFixed(0)).join('/') +
    ', разброс ' + (r.drift * 100).toFixed(0) + '% (допуск ' + (EXTENT_DRIFT_MAX * 100) + '%)');
}

for (const r of tinyRows) {
  if (r.tiny > 0) {
    console.log(r.name.padEnd(24) + ' точек мельче пикселя на глубине 400: ' +
      (r.tiny * 100).toFixed(0) + '% (порог ' + (TINY_SHARE_MAX * 100) + '%)');
  }
}

// Признак 3 из REFERENCE.md: восемь сидов дают восемь узнаваемо разных силуэтов.
// Порогом это не назначаем — «узнаётся» решает глаз на N21. Но самые похожие пары
// печатаем каждый прогон, чтобы близнецы не заводились незамеченными.
if (profiles.length > 2) {
  const pairs = [];
  for (let a = 0; a < profiles.length; a++) {
    for (let b = a + 1; b < profiles.length; b++) {
      let d = 0;
      for (let k = 0; k < 8; k++) d += Math.abs(profiles[a].prof[k] - profiles[b].prof[k]);
      pairs.push({ a: profiles[a].name, b: profiles[b].name, d });
    }
  }
  pairs.sort((x, y) => x.d - y.d);
  console.log('самые похожие силуэты по профилю радиуса (справочно, не порог):');
  for (const p of pairs.slice(0, 3)) {
    console.log('  ' + p.a + ' <-> ' + p.b + ' = ' + p.d.toFixed(3));
  }
  console.log('  самая далёкая пара: ' + pairs[pairs.length - 1].a + ' <-> ' +
    pairs[pairs.length - 1].b + ' = ' + pairs[pairs.length - 1].d.toFixed(3));
}

if (problems.length) {
  console.error('');
  console.error('ПРОВАЛ: раскладки не проходят проверку');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('LAYOUT_OK');
