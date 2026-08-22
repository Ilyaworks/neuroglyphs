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
const TARGETS = [5000, 20000];
const TOLERANCE = 0.30;
const SEED_A = 12345;
const SEED_B = 12346;

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
  const fns = Object.entries(mod).filter(([, v]) => typeof v === 'function');
  if (!fns.length) problems.push(rel + ': нет экспортированных функций');

  for (const [name, fn] of fns) {
    for (const target of TARGETS) {
      let res;
      try {
        res = fn(rngMod.mulberry32(SEED_A), { target });
      } catch (e) {
        problems.push(name + ' (target ' + target + '): упала — ' + e.message);
        continue;
      }
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
      rows.push({ name, target, count: res.count, off, sig });

      if (sig.nonFinite) problems.push(name + ': нечисловых координат ' + sig.nonFinite);
      if (sig.badScale) problems.push(name + ': неположительных scale ' + sig.badScale);
      if (!(sig.span[0] > 0 && sig.span[1] > 0 && sig.span[2] > 0)) {
        problems.push(name + ': габарит вырожден — ' + sig.span.map(v => v.toFixed(1)).join('x') +
          ', все точки лежат в плоскости или в одной точке');
      }
      if (off > TOLERANCE) {
        problems.push(name + ': просили ' + target + ' точек, вернула ' + res.count +
          ' (отклонение ' + (off * 100).toFixed(0) + '% при допуске ' + (TOLERANCE * 100) + '%). ' +
          'Плотность поля берётся из сида, поэтому раскладка обязана уметь наполнить ' +
          'мир на заданное число точек.');
      }

      if (target === TARGETS[TARGETS.length - 1]) {
        const again = fn(rngMod.mulberry32(SEED_A), { target });
        const other = fn(rngMod.mulberry32(SEED_B), { target });
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
    ', отклонение ' + (r.off * 100).toFixed(0).padStart(3) + '%' +
    ', габарит ' + r.sig.span.map(v => v.toFixed(0)).join('x').padEnd(15) +
    ', занято вокселей ' + r.sig.occupancy.toFixed(3) +
    ', анизотропия ' + r.sig.anisotropy.toFixed(2) +
    ', scale ' + r.sig.scaleMin.toFixed(2) + '..' + r.sig.scaleMax.toFixed(2));
}

if (problems.length) {
  console.error('');
  console.error('ПРОВАЛ: раскладки не проходят проверку');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('LAYOUT_OK');
