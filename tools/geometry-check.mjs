// Прогоняет src/world/fieldGeometry.js по-настоящему: подменяет three заглушкой,
// вызывает buildFieldGeometry и проверяет, что атрибуты действительно заполнены.
//
//   node tools/geometry-check.mjs
//
// Зачем отдельный инструмент: `node --check` проверяет только синтаксис. Модуль,
// который забыл `import * as THREE from "three"` и падает с ReferenceError на первом
// же вызове, проходит `node --check` молча, а browser-check его не видит, потому что
// до N11 модуль ниоткуда не импортируется. Именно так N09 закрылась неработающей.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TARGET = 'src/world/fieldGeometry.js';
const CHUNK_EXPECTED = 20000;
const COUNT = 50000;

const fails = [];
function bad(msg) { fails.push(msg); }

// ---- 1. статическая проверка: THREE без импорта, по всему src/ ----------------
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.m?js$/.test(e.name)) out.push(p);
  }
  return out;
}
const srcFiles = fs.existsSync('src') ? walk('src') : [];
let usesThree = 0;
let missingImport = 0;
for (const f of srcFiles) {
  const src = fs.readFileSync(f, 'utf8');
  if (!/\bTHREE\s*\./.test(src)) continue;
  usesThree++;
  if (!/^\s*import\s[^;]*\sfrom\s*['"]three['"]/m.test(src)) {
    missingImport++;
    bad(f.replace(/\\/g, '/') + ': пользуется THREE, но не импортирует его из "three" — '
      + 'в модуле THREE не глобальный, будет ReferenceError на первом вызове');
  }
}
console.log('файлов в src/ с THREE: ' + usesThree + ' из ' + srcFiles.length
  + ', без импорта: ' + missingImport);

if (!fs.existsSync(TARGET)) {
  console.error(TARGET + ' не найден');
  process.exit(1);
}

// ---- 2. заглушка three и подмена спецификатора --------------------------------
const STUB = [
  'class BufferAttribute {',
  '  constructor(array, itemSize) {',
  '    this.array = array; this.itemSize = itemSize; this.needsUpdate = false;',
  '  }',
  '}',
  'class Vector3 {',
  '  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }',
  '}',
  'class Sphere {',
  '  constructor(center = new Vector3(), radius = -1) { this.center = center; this.radius = radius; }',
  '}',
  'class BufferGeometry {',
  '  constructor() { this.attributes = {}; this.boundingSphere = null; this.boundingSphereCalls = 0; }',
  '  setAttribute(name, attr) { this.attributes[name] = attr; return this; }',
  '  getAttribute(name) { return this.attributes[name]; }',
  '  setDrawRange() {}',
  '  dispose() {}',
  '  computeBoundingSphere() {',
  '    this.boundingSphereCalls++;',
  '    const p = this.attributes.position;',
  '    if (!p) { this.boundingSphere = new Sphere(); return; }',
  '    const a = p.array, n = a.length / 3;',
  '    let cx = 0, cy = 0, cz = 0;',
  '    for (let i = 0; i < n; i++) { cx += a[i*3]; cy += a[i*3+1]; cz += a[i*3+2]; }',
  '    cx /= n; cy /= n; cz /= n;',
  '    let r2 = 0;',
  '    for (let i = 0; i < n; i++) {',
  '      const dx = a[i*3]-cx, dy = a[i*3+1]-cy, dz = a[i*3+2]-cz;',
  '      const d = dx*dx + dy*dy + dz*dz;',
  '      if (d > r2) r2 = d;',
  '    }',
  '    this.boundingSphere = new Sphere(new Vector3(cx, cy, cz), Math.sqrt(r2));',
  '  }',
  '}',
  'export { BufferAttribute, BufferGeometry, Sphere, Vector3 };',
  'export const AdditiveBlending = 2;',
].join('\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'geomcheck-'));
fs.writeFileSync(path.join(tmp, 'three-stub.mjs'), STUB);
// Модуль исполняется из временной папки, поэтому его относительные импорты надо
// переписать в абсолютные — иначе `../core/rng.js` уедет мимо проекта и упадёт
// с ERR_MODULE_NOT_FOUND, а инструмент объявит ложный провал.
const targetDir = path.resolve(path.dirname(TARGET));
const stubUrl = pathToFileURL(path.join(tmp, 'three-stub.mjs')).href;
const patched = fs.readFileSync(TARGET, 'utf8')
  .replace(/(\sfrom\s*)['"](\.\.?\/[^'"]+)['"]/g,
    (_, from, spec) => from + JSON.stringify(pathToFileURL(path.resolve(targetDir, spec)).href))
  .replace(/(\sfrom\s*)['"]three['"]/g, (_, from) => from + JSON.stringify(stubUrl));
const modPath = path.join(tmp, 'fieldGeometry.mjs');
fs.writeFileSync(modPath, patched);

let rafCalls = 0;
globalThis.requestAnimationFrame = (fn) => { rafCalls++; return setTimeout(fn, 0); };
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);

function settle(p, ms) {
  return Promise.race([
    p.then(() => 'разрешился', (e) => 'отклонён: ' + (e && e.message)),
    new Promise((r) => setTimeout(() => r('ЗАВИС'), ms)),
  ]);
}

function report(code) {
  fs.rmSync(tmp, { recursive: true, force: true });
  if (fails.length) {
    console.error('');
    for (const f of fails) console.error('  x ' + f);
    console.error('');
    console.error('GEOMETRY_FAIL');
    process.exit(1);
  }
  console.log('GEOMETRY_OK');
  process.exit(code || 0);
}

const mod = await import(pathToFileURL(modPath).href);
if (typeof mod.buildFieldGeometry !== 'function') {
  bad('нет экспорта buildFieldGeometry');
  report();
}

// ---- 3. прогон ----------------------------------------------------------------
const expect = (i) => [Math.sin(i) * 400, Math.cos(i) * 400, (i % 97) - 48];
let res;
try {
  res = mod.buildFieldGeometry(COUNT, (i, out) => {
    const e = expect(i);
    out[0] = e[0]; out[1] = e[1]; out[2] = e[2];
  });
} catch (e) {
  bad('buildFieldGeometry упал на вызове: ' + e.constructor.name + ': ' + e.message);
  report();
}

if (!res || !res.geometry || typeof res.ready?.then !== 'function') {
  bad('возвращать надо { geometry, ready }, где ready — промис');
  report();
}

const state = await settle(res.ready, 8000);
console.log('ready: ' + state);
if (state !== 'разрешился') bad('ready не разрешился на исправном fill: ' + state);

const g = res.geometry;
const need = { position: 3, glyph: 1, size: 1, offset: 1 };
for (const [name, itemSize] of Object.entries(need)) {
  const a = g.attributes[name];
  if (!a) { bad('нет атрибута ' + name); continue; }
  if (a.itemSize !== itemSize) bad(name + ': itemSize ' + a.itemSize + ', ожидалось ' + itemSize);
  if (a.array.length !== COUNT * itemSize) {
    bad(name + ': длина ' + a.array.length + ', ожидалось ' + COUNT * itemSize);
  }
}

const pos = g.attributes.position?.array;
if (pos) {
  let wrong = 0, firstWrong = -1;
  for (let i = 0; i < COUNT; i++) {
    const e = expect(i);
    for (let k = 0; k < 3; k++) {
      if (Math.abs(pos[i * 3 + k] - e[k]) > 1e-2) {
        wrong++;
        if (firstWrong < 0) firstWrong = i;
        break;
      }
    }
  }
  console.log('position: расхождений с fill ' + wrong + ' из ' + COUNT
    + (firstWrong >= 0 ? ', первое на индексе ' + firstWrong : ''));
  if (wrong) {
    bad('position заполнен не целиком: ' + wrong + ' точек из ' + COUNT
      + ' не совпали с fill, первая — индекс ' + firstWrong);
  }
}

function stats(name) {
  const a = g.attributes[name]?.array;
  if (!a) return null;
  let min = Infinity, max = -Infinity, nonFinite = 0, allInt = true;
  const seen = new Set();
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isFinite(v)) { nonFinite++; continue; }
    if (v < min) min = v;
    if (v > max) max = v;
    if (!Number.isInteger(v)) allInt = false;
    if (seen.size < 512) seen.add(v);
  }
  return { min, max, nonFinite, allInt, distinct: seen.size };
}

const gl = stats('glyph');
if (gl) {
  console.log('glyph: диапазон ' + gl.min + '..' + gl.max + ', различных ' + gl.distinct);
  if (gl.nonFinite) bad('glyph: нечисловых значений ' + gl.nonFinite);
  if (gl.min < 0 || gl.max > 127) {
    bad('glyph: диапазон ' + gl.min + '..' + gl.max + ' вне 0..127 — атлас держит 128 глифов');
  }
  if (gl.distinct < 8) {
    bad('glyph: различных значений ' + gl.distinct
      + ' — атрибут не заполнен, все точки станут одним и тем же глифом');
  }
  if (!gl.allInt) bad('glyph: значения не целые — это индекс клетки атласа');
}

const sz = stats('size');
if (sz) {
  console.log('size: диапазон ' + sz.min.toFixed(3) + '..' + sz.max.toFixed(3)
    + ', различных ' + sz.distinct);
  if (sz.nonFinite) bad('size: нечисловых значений ' + sz.nonFinite);
  if (!(sz.min > 0)) {
    bad('size: минимум ' + sz.min + ' — точки нулевого размера не видно, экран останется чёрным');
  }
  if (sz.distinct < 8) bad('size: различных значений ' + sz.distinct + ' — атрибут не заполнен');
}

const off = stats('offset');
if (off) {
  console.log('offset: диапазон ' + off.min.toFixed(3) + '..' + off.max.toFixed(3)
    + ', различных ' + off.distinct);
  if (off.nonFinite) bad('offset: нечисловых значений ' + off.nonFinite);
  if (off.distinct < 8) {
    bad('offset: различных значений ' + off.distinct
      + ' — фазы пульсации совпадут, мир будет мигать целиком');
  }
}

const chunksExpected = Math.ceil(COUNT / CHUNK_EXPECTED);
console.log('requestAnimationFrame вызван ' + rafCalls + ' раз, ожидалось не меньше '
  + chunksExpected + ' (чанк ' + CHUNK_EXPECTED + ' точек)');
if (rafCalls < chunksExpected) {
  bad('наполнение не разбито на чанки по ' + CHUNK_EXPECTED + ': rAF вызван ' + rafCalls
    + ' раз вместо ' + chunksExpected);
}

if (!g.boundingSphere || !(g.boundingSphere.radius > 0)) {
  bad('boundingSphere не посчитан после наполнения — three посчитает его по нулевым '
    + 'координатам и отсечёт облако отсечением по пирамиде видимости');
} else {
  console.log('boundingSphere: радиус ' + g.boundingSphere.radius.toFixed(1)
    + ', пересчётов ' + g.boundingSphereCalls);
}

// ---- 4. fill бросает исключение: ready обязан осесть, а не висеть -------------
try {
  const boom = mod.buildFieldGeometry(100, () => { throw new Error('fill сломан'); });
  const s = await settle(boom.ready, 3000);
  console.log('fill с исключением: ready — ' + s);
  if (s === 'ЗАВИС') {
    bad('fill бросил исключение, ready не осел — вызывающий код зависнет навсегда '
      + 'с чёрным экраном; нужен reject');
  }
} catch (e) {
  console.log('fill с исключением: buildFieldGeometry бросил сразу — ' + e.message);
}

report();
