// Прогоняет портал выхода по-настоящему: подменяет three заглушкой, зовёт
// buildExitPortal и проверяет контракт, который иначе не проверяет никто.
//
//   node tools/portal-check.mjs
//   node tools/portal-check.mjs --mod tools/fixture-portal.js
//
// Зачем: у N17 проверкой был только "node --check". Он молчит и на модуле, который
// падает на первом вызове (так закрылась N09), и на модуле, который собирается, но
// строит одинаковый портал во всех мирах. Первая версия N17 проходила "node --check"
// с рамкой из двух сторон вместо четырёх и с потоком случайности, не зависящим от сида.
//
// --mod нужен для проверки самого инструмента на эталоне tools/fixture-portal.js:
// инструмент, который не проходит ни на чём, ничего не проверяет.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { encodeSeed, decodeSeed, SEED_FIELDS } from '../src/core/seed.js';
import { mulberry32 } from '../src/core/rng.js';

const modArg = (() => {
  const i = process.argv.indexOf('--mod');
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();
const TARGET = modArg || 'src/world/portal.js';

// Сколько сидов гоняем. Двадцать четыре: на меньшем числе разброс слотов комбо сам
// по себе мал, и порог «слот меняется» ловил бы шум, а не вырождение.
const SEEDS = 24;
// Пороги разнообразия. Замер на эталоне печатается ниже в выводе; пороги стоят заметно
// ниже замера. Их дело — поймать вырождение: слот-константа даёт 1, портал, не
// зависящий от сида, даёт 1. Качество перемешивания они не меряют.
const MIN_UNIQUE_PORTALS = 16;
const MIN_UNIQUE_FRAMES = 6;
const MIN_UNIQUE_SLOT = { color: 4, object: 4, sound: 3, formula: 6 };
// Каждая из четырёх сторон рамки обязана нести хотя бы столько точек. Ровный обход
// прямоугольника 60x36 даёт 31% на длинных сторонах и 19% на коротких; 10% — вдвое
// ниже худшей стороны, то есть запас, а не край.
const MIN_SIDE_SHARE = 0.10;
// Насколько несимметричной может быть рамка. Прямоугольник вокруг центра даёт 0.
const MAX_ASYMMETRY = 0.06;

const fails = [];
const bad = (m) => fails.push(m);

if (!fs.existsSync(TARGET)) { console.error(TARGET + ' не найден'); process.exit(1); }

// ---- заглушка three ------------------------------------------------------------
const STUB = [
  'class Vector3 {',
  '  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }',
  '  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }',
  '  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }',
  '  clone() { return new Vector3(this.x, this.y, this.z); }',
  '}',
  'class Color {',
  '  constructor(hex) { this.r = 0; this.g = 0; this.b = 0; if (typeof hex === "number") {',
  '    this.r = ((hex >> 16) & 255) / 255; this.g = ((hex >> 8) & 255) / 255; this.b = (hex & 255) / 255; } }',
  '  setHSL(h, s, l) {',
  '    const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l);',
  '      return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); };',
  '    this.r = f(0); this.g = f(8); this.b = f(4); return this;',
  '  }',
  '}',
  'class BufferAttribute {',
  '  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize;',
  '    this.count = array.length / itemSize; this.needsUpdate = false; }',
  '}',
  'class BufferGeometry {',
  '  constructor() { this.attributes = {}; this.boundingSphere = null; }',
  '  setAttribute(n, a) { this.attributes[n] = a; return this; }',
  '  getAttribute(n) { return this.attributes[n]; }',
  '  computeBoundingSphere() { this.boundingSphere = { radius: 1 }; }',
  '  dispose() {}',
  '}',
  'class Object3D {',
  '  constructor() { this.children = []; this.userData = {}; this.position = new Vector3();',
  '    this.visible = true; this.name = ""; }',
  '  add(o) { this.children.push(o); return this; }',
  '  traverse(fn) { fn(this); for (const c of this.children) { if (c.traverse) c.traverse(fn); else fn(c); } }',
  '}',
  'class Group extends Object3D {}',
  'class Points extends Object3D {',
  '  constructor(geometry, material) { super(); this.geometry = geometry;',
  '    this.material = material; this.isPoints = true; }',
  '}',
  'class ShaderMaterial {',
  '  constructor(p = {}) { Object.assign(this, p); this.uniforms = p.uniforms || {}; }',
  '  dispose() {}',
  '}',
  'class Texture { constructor() { this.needsUpdate = false; } dispose() {} }',
  'export { Vector3, Color, BufferAttribute, BufferGeometry, Object3D, Group, Points, ShaderMaterial, Texture };',
  'export const AdditiveBlending = 2;',
  'export const NormalBlending = 1;',
  'export const DoubleSide = 2;',
].join('\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'portalcheck-'));
const stubPath = path.join(tmp, 'three-stub.mjs');
fs.writeFileSync(stubPath, STUB);
// Подмена на весь граф импортов, а не только в целевом файле: портал тянет
// fieldMaterial.js, который тоже импортирует three.
fs.writeFileSync(path.join(tmp, 'loader.mjs'), [
  'const STUB = ' + JSON.stringify(pathToFileURL(stubPath).href) + ';',
  'export async function resolve(spec, ctx, next) {',
  '  if (spec === "three") return { url: STUB, shortCircuit: true };',
  '  return next(spec, ctx);',
  '}',
].join('\n'));
register(pathToFileURL(path.join(tmp, 'loader.mjs')).href, import.meta.url);

function report() {
  fs.rmSync(tmp, { recursive: true, force: true });
  if (fails.length) {
    console.error('');
    for (const f of fails) console.error('  x ' + f);
    console.error('');
    console.error('PORTAL_FAIL');
    process.exit(1);
  }
  console.log('PORTAL_OK');
  process.exit(0);
}

// Атлас нужен материалу поля: он берёт из него текстуру и больше ничего.
const atlas = { texture: {}, uv: [], cell: 32, cols: 16, rows: 8, canvas: {} };

let mod;
try {
  mod = await import(pathToFileURL(path.resolve(TARGET)).href);
} catch (e) {
  bad('модуль не импортируется: ' + (e && e.message));
  report();
}
if (typeof mod.buildExitPortal !== 'function') { bad('нет экспорта buildExitPortal'); report(); }

const codes = (() => {
  const rnd = mulberry32(0x51ed2701);
  const out = [];
  while (out.length < SEEDS) {
    const f = {};
    for (const fl of SEED_FIELDS) f[fl.name] = Math.floor(rnd() * (1 << fl.bits));
    const code = encodeSeed(f);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
})();

function call(seed, label) {
  try {
    const p = mod.buildExitPortal(seed, atlas);
    if (!p || typeof p !== 'object') { bad(label + ': вернулся не объект'); return null; }
    for (const k of ['group', 'combo', 'slots', 'isSolved', 'position']) {
      if (p[k] === undefined) { bad(label + ': в ответе нет поля ' + k); return null; }
    }
    if (typeof p.isSolved !== 'function') { bad(label + ': isSolved не функция'); return null; }
    return p;
  } catch (e) {
    bad(label + ': вызов упал — ' + (e && e.message));
    return null;
  }
}

function clouds(p) {
  const out = [];
  p.group.traverse((o) => { if (o.isPoints && o.geometry) out.push(o); });
  return out;
}

function attrs(c) {
  const a = c.geometry.attributes;
  return {
    pos: a.position ? a.position.array : null,
    glyph: a.glyph ? a.glyph.array : null,
    size: a.size ? a.size.array : null,
    off: a.offset ? a.offset.array : null,
  };
}

function bbox(cloud) {
  const a = attrs(cloud).pos || [];
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], nan: 0 };
  for (let i = 0; i < a.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = a[i + k];
      if (!Number.isFinite(v)) { b.nan++; continue; }
      if (v < b.min[k]) b.min[k] = v;
      if (v > b.max[k]) b.max[k] = v;
    }
  }
  return b;
}

function bboxDiag(cloud) {
  const b = bbox(cloud);
  if (!Number.isFinite(b.min[0]) || !Number.isFinite(b.max[0])) return -1;
  return Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1]);
}

function biggest(list) {
  return list.slice().sort((a, b) => bboxDiag(b) - bboxDiag(a))[0];
}

function hash(p) {
  const parts = clouds(p).map((c) => {
    const a = attrs(c);
    return ['pos', 'glyph', 'size', 'off']
      .map((k) => (a[k] ? Array.from(a[k]).map((v) => Math.round(v * 1000)).join(',') : 'нет'))
      .join('|');
  });
  const c = p.combo || {};
  parts.push([c.color && c.color.r, c.color && c.color.g, c.color && c.color.b,
    c.object, c.sound, c.formula].join(','));
  return parts.join('#');
}

function frameHash(p) {
  const cs = clouds(p);
  if (!cs.length) return 'пусто';
  const a = attrs(biggest(cs));
  return Array.from(a.pos || []).map((v) => Math.round(v * 1000)).join(',') +
    '|' + Array.from(a.glyph || []).join(',');
}

// ---- 1. базовый вызов, облака, атрибуты ---------------------------------------
const base = call(decodeSeed(codes[0]), 'вызов полями сида');
if (!base) report();
const baseClouds = clouds(base);
console.log('облаков точек в портале: ' + baseClouds.length);
if (baseClouds.length < 2) {
  bad('в портале меньше двух облаков точек: рамка и контур отверстия — это два разных облака');
}
for (let i = 0; i < baseClouds.length; i++) {
  const a = attrs(baseClouds[i]);
  const n = a.pos ? a.pos.length / 3 : 0;
  const spread = (arr) => (arr ? new Set(Array.from(arr).map((v) => Math.round(v * 100))).size : 0);
  console.log('  облако ' + i + ': точек ' + n + ', разных глифов ' + spread(a.glyph) +
    ', разных размеров ' + spread(a.size) + ', разных фаз ' + spread(a.off));
  for (const k of ['pos', 'glyph', 'size', 'off']) {
    if (!a[k]) { bad('облако ' + i + ': нет атрибута ' + k); continue; }
    if (Array.from(a[k]).some((v) => !Number.isFinite(v))) {
      bad('облако ' + i + ': в атрибуте ' + k + ' не число');
    }
  }
  if (spread(a.glyph) < 2) bad('облако ' + i + ': все глифы одинаковые — атрибут выделен, но не заполнен');
  if (spread(a.size) < 2) bad('облако ' + i + ': все размеры одинаковые — атрибут выделен, но не заполнен');
}

// ---- 2. рамка прямоугольная и замкнутая ---------------------------------------
const frame = baseClouds.length ? biggest(baseClouds) : null;
if (frame) {
  const b = bbox(frame);
  const w = b.max[0] - b.min[0];
  const h = b.max[1] - b.min[1];
  const asymX = Math.abs(b.min[0] + b.max[0]) / (w || 1);
  const asymY = Math.abs(b.min[1] + b.max[1]) / (h || 1);
  console.log('рамка: x ' + b.min[0].toFixed(1) + '..' + b.max[0].toFixed(1) +
    ', y ' + b.min[1].toFixed(1) + '..' + b.max[1].toFixed(1) +
    ', перекос по x ' + asymX.toFixed(3) + ', по y ' + asymY.toFixed(3) +
    ', порог ' + MAX_ASYMMETRY);
  if (!(w > 0) || !(h > 0)) bad('рамка вырождена: нулевая ширина или высота');
  if (asymX > MAX_ASYMMETRY || asymY > MAX_ASYMMETRY) {
    bad('рамка не симметрична относительно центра (перекос ' + asymX.toFixed(3) + '/' +
      asymY.toFixed(3) + '): обычно это обход периметра, оборванный на половине.');
  }
  const a = attrs(frame).pos || [];
  const n = a.length / 3;
  const tol = 0.05;
  const sides = { верх: 0, низ: 0, левая: 0, правая: 0 };
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i];
    const y = a[i + 1];
    if (Math.abs(y - b.max[1]) <= h * tol) sides.верх++;
    if (Math.abs(y - b.min[1]) <= h * tol) sides.низ++;
    if (Math.abs(x - b.min[0]) <= w * tol) sides.левая++;
    if (Math.abs(x - b.max[0]) <= w * tol) sides.правая++;
  }
  console.log('точек на сторонах рамки из ' + n + ': ' +
    Object.entries(sides).map(([k, v]) => k + ' ' + v + ' (' + (v / n * 100).toFixed(0) + '%)').join(', ') +
    ', нужно не меньше ' + (MIN_SIDE_SHARE * 100).toFixed(0) + '%');
  for (const [name, cnt] of Object.entries(sides)) {
    if (!(cnt / n >= MIN_SIDE_SHARE)) {
      bad('сторона рамки «' + name + '» несёт ' + (cnt / n * 100).toFixed(0) +
        '% точек при пороге ' + (MIN_SIDE_SHARE * 100).toFixed(0) +
        '%: выход обязан быть прямоугольным, а не разомкнутым.');
    }
  }
  // Контур отверстия обязан помещаться внутрь рамки, иначе он торчит наружу.
  for (const c of baseClouds) {
    if (c === frame) continue;
    const hb = bbox(c);
    if (hb.max[0] > b.max[0] || hb.min[0] < b.min[0] || hb.max[1] > b.max[1] || hb.min[1] < b.min[1]) {
      bad('контур отверстия вылезает за рамку: x ' + hb.min[0].toFixed(1) + '..' + hb.max[0].toFixed(1) +
        ', y ' + hb.min[1].toFixed(1) + '..' + hb.max[1].toFixed(1) +
        ' при рамке x ' + b.min[0].toFixed(1) + '..' + b.max[0].toFixed(1) +
        ', y ' + b.min[1].toFixed(1) + '..' + b.max[1].toFixed(1));
    }
  }
}

// ---- 3. детерминизм и совпадение двух форм вызова -----------------------------
const twice = call(decodeSeed(codes[0]), 'повторный вызов');
if (twice && hash(base) !== hash(twice)) {
  bad('два вызова на одном сиде дали разные порталы — нарушено правило 7');
}
const byCode = call(codes[0], 'вызов кодом сида');
if (byCode) {
  const same = hash(byCode) === hash(base);
  console.log('вызов кодом и вызов полями дают один портал: ' + same);
  if (!same) {
    bad('buildExitPortal(код) и buildExitPortal(decodeSeed(код)) дали разные порталы. ' +
      'Оба вида вызова обязаны нормализоваться в один сид, иначе половина данных теряется: ' +
      'из кода не достаётся exit, из полей — поток случайности.');
  }
}

// ---- 4. портал зависит от сида ------------------------------------------------
const built = codes.map((c) => call(decodeSeed(c), 'сид ' + c)).filter(Boolean);
if (built.length === codes.length) {
  const uniq = new Set(built.map(hash)).size;
  const uniqFrames = new Set(built.map(frameHash)).size;
  console.log('уникальных порталов из ' + codes.length + ': ' + uniq +
    ', нужно не меньше ' + MIN_UNIQUE_PORTALS);
  console.log('уникальных рамок из ' + codes.length + ': ' + uniqFrames +
    ', нужно не меньше ' + MIN_UNIQUE_FRAMES);
  if (uniq < MIN_UNIQUE_PORTALS) {
    bad('портал почти не зависит от сида: уникальных ' + uniq + ' из ' + codes.length);
  }
  if (uniqFrames < MIN_UNIQUE_FRAMES) {
    bad('рамка одинакова в разных мирах (уникальных ' + uniqFrames + ' из ' + codes.length +
      '): поток случайности не выведен из сида.');
  }
  const slotVals = { color: new Set(), object: new Set(), sound: new Set(), formula: new Set() };
  for (const p of built) {
    const c = p.combo || {};
    slotVals.color.add(c.color ? [c.color.r, c.color.g, c.color.b].map((v) => Math.round(v * 1000)).join(',') : 'нет');
    slotVals.object.add(String(c.object));
    slotVals.sound.add(String(c.sound));
    slotVals.formula.add(String(c.formula));
  }
  console.log('разных значений слотов на ' + codes.length + ' сидах: ' +
    Object.entries(slotVals).map(([k, s]) => k + ' ' + s.size + ' (нужно ' + MIN_UNIQUE_SLOT[k] + ')').join(', '));
  for (const [k, s] of Object.entries(slotVals)) {
    if (s.size < MIN_UNIQUE_SLOT[k]) {
      bad('слот комбо «' + k + '» принимает ' + s.size + ' значений на ' + codes.length +
        ' сидах при пороге ' + MIN_UNIQUE_SLOT[k] + ': загадка вырождена, слот не несёт информации.');
    }
  }
  // Инвариант: выход есть в каждом мире.
  for (let i = 0; i < built.length; i++) {
    const cs = clouds(built[i]);
    if (!cs.length || !(bboxDiag(biggest(cs)) > 0)) {
      bad('в мире ' + codes[i] + ' портала нет или он вырожден — выход обязан быть в каждом мире');
    }
  }
}

// ---- 5. isSolved --------------------------------------------------------------
if (base) {
  const c = base.combo || {};
  const col = c.color || { r: 0, g: 0, b: 0 };
  const good = [c.color, c.object, c.sound, c.formula];
  const cases = [
    ['верное комбо', good, true],
    ['подменён объект', [c.color, (c.object + 1) % 8, c.sound, c.formula], false],
    ['подменён звук', [c.color, c.object, (c.sound + 1) % 4, c.formula], false],
    ['подменена формула', [c.color, c.object, c.sound, (c.formula + 1) % 128], false],
    ['подменён цвет', [{ r: 1 - (col.r || 0), g: 1 - (col.g || 0), b: 1 - (col.b || 0) }, c.object, c.sound, c.formula], false],
    ['три слота', good.slice(0, 3), false],
    ['пять слотов', good.concat([0]), false],
    ['не массив', null, false],
    ['пустой массив', [], false],
  ];
  const line = [];
  for (const [name, arg, want] of cases) {
    let got;
    try { got = base.isSolved(arg); } catch (e) { got = 'упало: ' + e.message; }
    line.push(name + ' → ' + got);
    if (got !== want) bad('isSolved(' + name + ') вернул ' + got + ', ожидалось ' + want);
  }
  console.log('isSolved: ' + line.join(', '));
  if (!Array.isArray(base.slots) || base.slots.length !== 4) {
    bad('slots — не четыре слота: пришло ' + (Array.isArray(base.slots) ? base.slots.length : typeof base.slots));
  } else {
    const kinds = base.slots.map((s) => s && s.kind);
    console.log('слоты: ' + kinds.join(', '));
    for (const k of ['color', 'object', 'sound', 'formula']) {
      if (!kinds.includes(k)) bad('среди слотов нет «' + k + '»');
    }
  }
  const pos = base.position;
  if (!pos || ![pos.x, pos.y, pos.z].every(Number.isFinite)) {
    bad('position — не точка с конечными координатами');
  }
}

report();
