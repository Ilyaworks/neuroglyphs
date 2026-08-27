// Прогоняет отражающий пол по-настоящему: подменяет three заглушкой, зовёт
// buildFloor и проверяет то, что иначе не проверяет никто.
//
//   node tools/floor-check.mjs
//   node tools/floor-check.mjs --mod tools/fixture-floor.js
//   node tools/floor-check.mjs --mod tools/fixture-floor.js --mutate copy
//
// Зачем: у N29 проверкой стоял только `node --check`, то есть синтаксис. Так уже
// закрывалась неработающая N09 — модуль падал с ReferenceError на первом вызове.
// Сверх этого `node --check` молчит на всех правдоподобных способах сдать пол
// неработающим: копия вместо отражения, затухание резкой границей, «затемнение»
// уменьшением размера точки (ниже пикселя это не тусклая точка, а отсутствующая —
// тот же класс, что R13), отражение в полную плотность, сетка пола, не зависящая
// от габарита мира.
//
// Чего этот гейт НЕ проверяет: что затухание видно на кадре. Данные и проводку
// атрибута в шейдере он читает, а доходит ли fade до пикселя — решается глазами
// на демо-точке D2. Врать об этом гейту нельзя.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// ── самопроверка гейта ────────────────────────────────────────────────────────
// Эталон обязан пройти, каждая порча — упасть, и новые порчи обязаны падать ПО СВОЕЙ
// причине. Без сверки причины слепота гейта прячется за посторонней ошибкой: порча
// «разметка россыпью» проходила насквозь, потому что проверка смотрела пол открытого
// пространства, где разметки нет вовсе, а порча «один род» падала на проверке сетки.
if (process.argv.includes('--self')) {
  const FIX = 'tools/fixture-floor.js';
  const withReason = [
    ['onekind', 'один род рисунка на полу', 'родов рисунка'],
    ['onescale', 'один масштаб на весь пол', 'масштабов'],
    ['dots', 'разметка рассыпана точками', 'разметка рассыпана'],
    ['sameloc', 'рисунок не зависит от локации', 'одинаков в городе'],
    ['nosolid', 'у пола нет сплошной поверхности', 'сплошной поверхности'],
  ];
  // Порчи отражения заведены вместе с гейтом раньше; здесь сверяется только падение.
  const failOnly = ['copy', 'flat', 'nofade', 'stepfade', 'shrink', 'dimsize',
    'samephase', 'random', 'fixedplane', 'noplane', 'noshader'];

  const run1 = (mut) => {
    try {
      const out = execFileSync(process.execPath,
        ['tools/floor-check.mjs', '--mod', FIX, ...(mut ? ['--mutate', mut] : [])],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { ok: true, out };
    } catch (e) {
      return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
    }
  };

  console.log('#'.repeat(78));
  console.log('САМОПРОВЕРКА ГЕЙТА: floor-check — пол, отражение и рисунок');
  console.log('#'.repeat(78));
  let bad2 = 0;
  const base = run1('');
  console.log(base.ok ? '  эталон прошёл' : '  !! ЭТАЛОН НЕ ПРОШЁЛ');
  if (!base.ok) { bad2++; for (const l of base.out.split(String.fromCharCode(10))) { if (l.startsWith('  x')) console.log(l); } }
  for (const [m, what, because] of withReason) {
    const r = run1(m);
    if (r.ok) { console.log('  !! ГЕЙТ СЛЕП на "' + m + '" (' + what + ')'); bad2++; continue; }
    if (!r.out.includes(because)) {
      console.log('  !! "' + m + '" упала НЕ ПО ТОЙ ПРИЧИНЕ: ждали "' + because + '"');
      bad2++;
    } else console.log('  "' + m + '" поймана по своей причине');
  }
  for (const m of failOnly) {
    const r = run1(m);
    if (r.ok) { console.log('  !! ГЕЙТ СЛЕП на "' + m + '"'); bad2++; }
  }
  console.log('#'.repeat(78));
  if (bad2) { console.log('САМОПРОВЕРКА ПРОВАЛЕНА: ' + bad2 + ' — гейту верить нельзя'); process.exit(1); }
  console.log('САМОПРОВЕРКА ПРОЙДЕНА: эталон проходит, все '
    + (withReason.length + failOnly.length) + ' порч ловятся');
  process.exit(0);
}

import os from 'node:os';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const argOf = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const modArg = argOf('--mod');
const TARGET = modArg || 'src/render/floor.js';
const MUTATE = argOf('--mutate') || '';
if (MUTATE) globalThis.__FLOOR_MUTATE = MUTATE;

// ---- пороги -------------------------------------------------------------------
// Все относительные: абсолютное число точек зависит от сида и бюджета мира.
// Замеры на эталоне печатаются в выводе, пороги стоят с запасом от них.
const MIRROR_SHARE = [0.30, 0.70];   // доля точек отражения от исходных: цель 0.5
const MIRROR_MATCH_MIN = 0.98;       // доля точек, легших ровно в зеркало линии пола
const MIRROR_SPREAD_MIN = 0.50;      // разброс глубины отражения к разбросу источника
const FADE_MID_MIN = 0.20;           // доля точек с промежуточным fade: нет резкой границы
// Ближняя четверть ярче дальней во столько раз. У отражения затухание крутое — это и
// есть «мокрый пол», замер на эталоне 6.58. У самой плоскости оно законно мягче,
// замер 2.89, поэтому порог свой: общий 2.0 стоял бы у плоскости на грани.
const FADE_RATIO_MIN = { 'отражение': 2.0, 'плоскость': 1.5 };
const SIZE_KEEP_MIN = 0.60;          // средний размер отражения к размеру источника
const SIZE_TINY_MAX = 0.10;          // доля точек отражения размером меньше пикселя
const PHASE_DIFF_MIN = 0.02;         // средний сдвиг фазы пульсации
const PLANE_BAND = 0.02;             // толщина плоскости пола в долях высоты мира
const PLANE_GRID = [8, 160];         // различных значений x в сетке пола
const FLOOR_KINDS_MIN = 3;           // родов рисунка на полу (N68)
const FLOOR_SCALES_MIN = 3;          // разных масштабов на полу
const FLOOR_SCALE_SPREAD = 8;        // во сколько раз крупнейший знак больше мельчайшего
// Порог линейности разметки стоит МЕЖДУ линиями и россыпью, а не на идеале. Разметка
// на полу — несколько параллельных дуг, и разброс поперёк у их объединения законно
// заметный: замер на эталоне 0.87, на россыпи 0.53. Порог на 0.90 валил бы честную
// реализацию — это был бы флак, а не гейт.
const MARKING_LINE_MIN = 0.78;       // доля разброса разметки по главной оси
const PLANE_STEP_CV = 0.15;          // неровность шага сетки
const PLANE_SPAN_RESP = [1.6, 2.4];  // мир вдвое шире — пол обязан стать вдвое шире
const GLYPH_DISTINCT_MIN = 8;

const fails = [];
const bad = (m) => fails.push(m);

if (!fs.existsSync(TARGET)) { console.error(TARGET + ' не найден'); process.exit(1); }

// ---- заглушка three ------------------------------------------------------------
const STUB = [
  'export const disposals = { geometry: 0, material: 0 };',
  'class Vector3 {',
  '  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }',
  '  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }',
  '  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }',
  '  clone() { return new Vector3(this.x, this.y, this.z); }',
  '  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }',
  '}',
  'class Color {',
  '  constructor(hex) { this.r = 0; this.g = 0; this.b = 0; if (typeof hex === "number") {',
  '    this.r = ((hex >> 16) & 255) / 255; this.g = ((hex >> 8) & 255) / 255; this.b = (hex & 255) / 255; } }',
  '}',
  'class BufferAttribute {',
  '  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize;',
  '    this.count = array.length / itemSize; this.needsUpdate = false; }',
  '}',
  'class BufferGeometry {',
  '  constructor() { this.attributes = {}; this.boundingSphere = null; this.disposed = false; }',
  '  setAttribute(n, a) { this.attributes[n] = a; return this; }',
  '  getAttribute(n) { return this.attributes[n]; }',
  '  computeBoundingSphere() { this.boundingSphere = { radius: 1 }; }',
  '  setDrawRange() {}',
  '  setIndex(i) { this.index = i; return this; }',
  '  dispose() { this.disposed = true; disposals.geometry++; }',
  '}',
  'class Object3D {',
  '  constructor() { this.children = []; this.userData = {}; this.position = new Vector3();',
  '    this.scale = new Vector3(1, 1, 1); this.visible = true; this.frustumCulled = true; this.name = ""; }',
  '  add(o) { this.children.push(o); return this; }',
  '  remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); return this; }',
  '  clear() { this.children.length = 0; return this; }',
  '  traverse(fn) { fn(this); for (const c of this.children) { if (c.traverse) c.traverse(fn); else fn(c); } }',
  '}',
  'class Group extends Object3D { constructor() { super(); this.isGroup = true; } }',
  // Mesh и MeshBasicMaterial в заглушке отсутствовали, и это не мелочь: сплошную
  // поверхность пола — то единственное, что закрывает пространство ПОД полом, —
  // из точек не построить. Пока классов не было, любая честная версия падала на
  // «Mesh is not a constructor», и гейт запрещал единственную правильную
  // конструкцию. Ниже добавлена и проверка, что поверхность у пола есть.
  'class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; }',
  '  set(x, y) { this.x = x; this.y = y; return this; } }',
  'class Mesh extends Object3D {',
  '  constructor(geometry, material) { super(); this.geometry = geometry;',
  '    this.material = material; this.isMesh = true; }',
  '}',
  'class MeshBasicMaterial {',
  '  constructor(p = {}) { Object.assign(this, p); this.disposed = false; }',
  '  dispose() { this.disposed = true; disposals.material++; }',
  '}',
  'class Points extends Object3D {',
  '  constructor(geometry, material) { super(); this.geometry = geometry;',
  '    this.material = material; this.isPoints = true; }',
  '}',
  'class ShaderMaterial {',
  '  constructor(p = {}) { Object.assign(this, p); this.uniforms = p.uniforms || {};',
  '    this.disposed = false; }',
  '  dispose() { this.disposed = true; disposals.material++; }',
  '}',
  'class Texture { constructor() { this.needsUpdate = false; } dispose() {} }',
  'class Matrix4 { constructor() { this.elements = new Array(16).fill(0); }',
  '  makeScale() { return this; } identity() { return this; } }',
  'export { Vector3, Color, BufferAttribute, BufferGeometry, Object3D, Group, Points, Mesh, MeshBasicMaterial, ShaderMaterial, Texture, Matrix4, Vector2 };',
  'export const AdditiveBlending = 2;',
  'export const NormalBlending = 1;',
  'export const DoubleSide = 2;',
  'export const FrontSide = 0;',
].join('\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'floorcheck-'));
const stubPath = path.join(tmp, 'three-stub.mjs');
fs.writeFileSync(stubPath, STUB);
// Подмена на весь граф импортов, а не только в целевом файле: пол потянет
// fieldMaterial.js или fieldGeometry.js, а они тоже импортируют three.
fs.writeFileSync(path.join(tmp, 'loader.mjs'), [
  'const STUB = ' + JSON.stringify(pathToFileURL(stubPath).href) + ';',
  'export async function resolve(spec, ctx, next) {',
  '  if (spec === "three") return { url: STUB, shortCircuit: true };',
  '  return next(spec, ctx);',
  '}',
].join('\n'));
register(pathToFileURL(path.join(tmp, 'loader.mjs')).href, import.meta.url);

const THREE = await import(pathToFileURL(stubPath).href);

function report() {
  fs.rmSync(tmp, { recursive: true, force: true });
  if (fails.length) {
    console.error('');
    for (const f of fails) console.error('  x ' + f);
    console.error('');
    console.error('FLOOR_FAIL');
    process.exit(1);
  }
  console.log('FLOOR_OK');
  process.exit(0);
}

// ---- поддельный мир ------------------------------------------------------------
// Линия пола НЕ на нуле: реализация, зашившая y = 0, обязана провалиться.
function makeWorld(scale = 1, seedTag = 'A') {
  const group = new THREE.Group();
  const atlas = new THREE.Texture();
  const uniforms = { uPulse: { value: 0 }, uTime: { value: 0 }, uAtlas: { value: atlas } };
  const clouds = [];
  const mk = (n, yLo, yHi, spanXZ, tag, noReflect) => {
    const pos = new Float32Array(n * 3);
    const glyph = new Float32Array(n);
    const size = new Float32Array(n);
    const offset = new Float32Array(n);
    // Детерминированный, но неровный профиль: перекос по y обязателен, иначе
    // «отражение» и «копия» дают одинаковый разброс глубины.
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pos[i * 3] = Math.sin(i * 1.7 + tag.length) * spanXZ;
      pos[i * 3 + 1] = yLo + (yHi - yLo) * Math.pow(t, 2.2);
      pos[i * 3 + 2] = Math.cos(i * 2.3 + tag.length) * spanXZ;
      glyph[i] = i % 128;
      size[i] = 2 + (i % 7) * 0.5;
      offset[i] = (i * 0.013) % 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('glyph', new THREE.BufferAttribute(glyph, 1));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    g.setAttribute('offset', new THREE.BufferAttribute(offset, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { uAtlas: { value: atlas } } });
    const p = new THREE.Points(g, mat);
    if (noReflect) p.userData.noReflect = true;
    group.add(p);
    if (!noReflect) clouds.push(p);
    return p;
  };
  mk(800, -120 * scale, 260 * scale, 300 * scale, 'field' + seedTag, false);
  mk(400, -40 * scale, 180 * scale, 200 * scale, 'shape' + seedTag, false);
  // Дальний план: его отражать не надо, и пол обязан уважать метку noReflect.
  mk(200, 1800, 2000, 2000, 'stars', true);

  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const c of clouds) {
    const a = c.geometry.attributes.position.array;
    for (let i = 0; i < a.length / 3; i++) {
      for (let k = 0; k < 3; k++) {
        const v = a[i * 3 + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
  }
  group.userData = {
    seed: 'FAKE-SEED-' + seedTag,
    structure: 0,
    bounds: { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] },
    exitPosition: new THREE.Vector3(0, 0, min[2] - 40),
    palette: { bg: '#000000', glyph: ['#0ff', '#f0f', '#0f8', '#fff'], fogDensity: 0.001 },
    fogDensity: 0.001,
  };
  return { group, uniforms, clouds, ready: Promise.resolve(true), dispose() {} };
}

// ---- прогон -------------------------------------------------------------------
const mod = await import(pathToFileURL(path.resolve(TARGET)).href);
if (typeof mod.buildFloor !== 'function') {
  bad('нет экспорта buildFloor');
  report();
}

const SEED = 'FLOOR-GATE-SEED';
const world = makeWorld(1, 'A');
let floor;
try {
  floor = mod.buildFloor(SEED, world);
} catch (e) {
  bad('buildFloor упал на вызове: ' + e.constructor.name + ': ' + e.message
    + ' — именно это `node --check` и не видит');
  report();
}
if (!floor || !floor.group || typeof floor.dispose !== 'function') {
  bad('возвращать надо { group, dispose() }');
  report();
}

// Линию пола берём у САМОГО пола, а не из габаритов мира. Гейт считал её равной
// bounds.min[1] и этим диктовал полу высоту. Коробку мира растягивают одиночные
// далёкие объекты: у сида 0000-5hgu-kr7u bounds.min[1] = -321, а светящиеся глифы
// лежат в полосе от -19 до +17. Пол по такому «низу» оказывается на дне ямы, и
// отражать ему нечего. Гейт обязан проверять согласованность отражения с настоящей
// линией пола, а не назначать её.
const floorY = floor.group.userData.floorY !== undefined
  ? floor.group.userData.floorY
  : world.group.userData.bounds.min[1];
const height = world.group.userData.bounds.size[1];
console.log('мир: линия пола y=' + floorY.toFixed(1) + ', высота ' + height.toFixed(1)
  + ', исходных облаков ' + world.clouds.length);

// Сплошная поверхность пола. Без неё пол ничего не загораживает: зеркальные копии
// висят в открытом пространстве и читаются вторым миром снизу, а не отражением, и
// сквозь «пол» светят звёзды. Человек на приёмке сказал об этом дословно: «выглядит
// не как отражение, а будто там внизу копия», «под полом ничего не должно быть видно».
{
  const solids = [];
  floor.group.traverse((o) => { if (o.userData && o.userData.floorPart === 'solid') solids.push(o); });
  if (solids.length !== 1) {
    bad('у пола нет сплошной поверхности (floorPart === "solid"): найдено ' + solids.length
      + '. Без неё пространство ПОД полом остаётся видимым, и отражение читается копией мира.');
  } else {
    const sol = solids[0];
    if (!sol.isMesh) {
      bad('сплошная поверхность пола не меш. Из точек поверхности не выходит: Points рисует '
        + 'по одной точке на вершину, у четырёхугольника их четыре.');
    }
    if (sol.material && sol.material.transparent === true) {
      bad('сплошная поверхность пола прозрачна — сквозь неё будет видно то, что под полом');
    }
    console.log('сплошная поверхность пола на месте: меш, непрозрачная');
  }
}

const parts = { mirror: [], plane: [], other: [] };
floor.group.traverse((o) => {
  if (!o.isPoints) return;
  const k = o.userData.floorPart;
  (parts[k] || parts.other).push(o);
});
console.log('части пола: отражений ' + parts.mirror.length + ', плоскостей ' + parts.plane.length
  + ', без метки floorPart ' + parts.other.length);
if (parts.other.length) {
  bad('у ' + parts.other.length + ' облаков нет userData.floorPart — гейт не может отличить '
    + 'отражение от плоскости, а мир не может выключить одно без другого');
}
if (!parts.mirror.length) bad('в группе пола нет отражения (userData.floorPart="mirror")');
if (!parts.plane.length) bad('в группе пола нет плоскости (userData.floorPart="plane")');

if (typeof floor.group.userData.floorY !== 'number') {
  bad('нет group.userData.floorY — камере и осмотру негде взять линию пола');
} else if (Math.abs(floor.group.userData.floorY - floorY) > 1e-6) {
  bad('group.userData.floorY = ' + floor.group.userData.floorY + ', а линия пола мира '
    + floorY + ': пол стоит не там, где низ мира');
}

// атрибуты на месте
const NEED = { position: 3, glyph: 1, size: 1, offset: 1, fade: 1 };
for (const p of [...parts.mirror, ...parts.plane]) {
  const tag = p.userData.floorPart;
  for (const [n, itemSize] of Object.entries(NEED)) {
    const a = p.geometry.attributes[n];
    if (!a) { bad(tag + ': нет атрибута ' + n); continue; }
    if (a.itemSize !== itemSize) bad(tag + ': ' + n + ' itemSize ' + a.itemSize + ', ждали ' + itemSize);
  }
}
if (fails.length) report();

const cat = (list, name) => {
  const out = [];
  for (const p of list) {
    const a = p.geometry.attributes[name].array;
    for (let i = 0; i < a.length; i++) out.push(a[i]);
  }
  return out;
};
const catPos = (list) => {
  const out = [];
  for (const p of list) {
    const a = p.geometry.attributes.position.array;
    for (let i = 0; i < a.length / 3; i++) out.push([a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]);
  }
  return out;
};
// Собрать один атрибут со всех частей подряд — тем же порядком, что и catPos.
const catOf = (list, name) => {
  const out = [];
  for (const p of list) {
    const at = p.geometry.attributes[name];
    if (!at) continue;
    for (let i = 0; i < at.array.length; i++) out.push(at.array[i]);
  }
  return out;
};
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) * (v - m)))); };
const distinct = (a) => new Set(a.map(v => Math.round(v * 1000) / 1000)).size;
const minOf = (a) => a.reduce((m, v) => (v < m ? v : m), Infinity);
const maxOf = (a) => a.reduce((m, v) => (v > m ? v : m), -Infinity);

// ---- 1. отражение: зеркало, а не копия ---------------------------------------
const srcCount = world.clouds.reduce((s, c) => s + c.geometry.attributes.glyph.array.length, 0);
const mirrorPos = catPos(parts.mirror);
const mirrorShare = mirrorPos.length / srcCount;
console.log('отражение: точек ' + mirrorPos.length + ' из ' + srcCount + ' исходных, доля '
  + mirrorShare.toFixed(3) + ' (цель 0.5, допуск ' + MIRROR_SHARE.join('..') + ')');
if (mirrorShare < MIRROR_SHARE[0] || mirrorShare > MIRROR_SHARE[1]) {
  bad('отражение построено с плотностью ' + mirrorShare.toFixed(3) + ' от исходной, а просили '
    + 'вдвое меньшую: допуск ' + MIRROR_SHARE.join('..')
    + (mirrorShare > MIRROR_SHARE[1] ? ' — полная копия удваивает цену кадра' : ''));
}

// карта источника: (x,z) -> записи, чтобы не зависеть от порядка и прореживания
const srcMap = new Map();
for (const c of world.clouds) {
  const a = c.geometry.attributes.position.array;
  const g = c.geometry.attributes.glyph.array;
  const s = c.geometry.attributes.size.array;
  const o = c.geometry.attributes.offset.array;
  for (let i = 0; i < g.length; i++) {
    const key = a[i * 3].toFixed(2) + ',' + a[i * 3 + 2].toFixed(2);
    if (!srcMap.has(key)) srcMap.set(key, []);
    srcMap.get(key).push({ y: a[i * 3 + 1], glyph: g[i], size: s[i], offset: o[i] });
  }
}

const mirrorFade = cat(parts.mirror, 'fade');
const mirrorSize = cat(parts.mirror, 'size');
const mirrorOff = cat(parts.mirror, 'offset');
let matched = 0, aboveFloor = 0;
const pairs = [];
for (let i = 0; i < mirrorPos.length; i++) {
  const [x, y, z] = mirrorPos[i];
  if (y > floorY + 1e-3) aboveFloor++;
  const recs = srcMap.get(x.toFixed(2) + ',' + z.toFixed(2));
  if (!recs) continue;
  const want = recs.find(r => Math.abs(2 * floorY - r.y - y) < 0.05);
  if (want) {
    matched++;
    pairs.push({ src: want, y, fade: mirrorFade[i], size: mirrorSize[i], offset: mirrorOff[i] });
  }
}
const matchShare = matched / (mirrorPos.length || 1);
console.log('отражение: легли ровно в зеркало линии пола ' + matched + ' из ' + mirrorPos.length
  + ' (' + (matchShare * 100).toFixed(1) + '%), выше линии пола ' + aboveFloor);
if (matchShare < MIRROR_MATCH_MIN) {
  bad('в зеркало относительно линии пола легли только ' + (matchShare * 100).toFixed(1)
    + '% точек отражения (нужно ' + (MIRROR_MATCH_MIN * 100) + '%): y отражения обязан быть '
    + '2*floorY - y источника. Копия без отражения и облако, схлопнутое в плоскость, '
    + 'на кадре отражением не читаются');
}
if (aboveFloor > mirrorPos.length * 0.01) {
  bad(aboveFloor + ' точек отражения оказались выше линии пола — отражение обязано быть под полом');
}

const srcY = [];
for (const c of world.clouds) {
  const a = c.geometry.attributes.position.array;
  for (let i = 0; i < a.length / 3; i++) srcY.push(a[i * 3 + 1]);
}
const spreadRatio = std(mirrorPos.map(p => p[1])) / (std(srcY) || 1);
console.log('отражение: разброс глубины к источнику ' + spreadRatio.toFixed(3));
if (spreadRatio < MIRROR_SPREAD_MIN) {
  bad('разброс глубины отражения ' + spreadRatio.toFixed(3) + ' от исходного (нужно '
    + MIRROR_SPREAD_MIN + '): отражение схлопнуто в плоскость, растянутых отражений не будет');
}

// ---- 2. затухание: отклик, без резкой границы, и не размером ------------------
function fadeChecks(list, label, distOf) {
  const fade = cat(list, 'fade');
  const pos = catPos(list);
  const outOfRange = fade.filter(v => v < -1e-6 || v > 1 + 1e-6).length;
  if (outOfRange) bad(label + ': ' + outOfRange + ' значений fade вне 0..1');
  const mid = fade.filter(v => v > 0.15 && v < 0.85).length / (fade.length || 1);
  const rows = pos.map((p, i) => ({ d: distOf(p), f: fade[i] })).sort((a, b) => a.d - b.d);
  const q = Math.max(1, Math.floor(rows.length / 4));
  const near = mean(rows.slice(0, q).map(r => r.f));
  const far = mean(rows.slice(-q).map(r => r.f));
  const ratio = far > 1e-6 ? near / far : Infinity;
  console.log(label + ': fade ' + minOf(fade).toFixed(3) + '..' + maxOf(fade).toFixed(3)
    + ', различных ' + distinct(fade) + ', промежуточных ' + (mid * 100).toFixed(1)
    + '%, ближняя четверть/дальняя ' + (ratio === Infinity ? 'бесконечность' : ratio.toFixed(2)));
  if (mid < FADE_MID_MIN) {
    bad(label + ': промежуточных значений fade всего ' + (mid * 100).toFixed(1) + '% (нужно '
      + FADE_MID_MIN * 100 + '%) — затухание сделано резкой границей или его нет вовсе; '
      + 'резкая граница отражения прямо запрещена в REFERENCE.md');
  }
  const need = FADE_RATIO_MIN[label];
  if (!(ratio >= need)) {
    bad(label + ': у линии пола ярче дальнего края всего в ' + ratio.toFixed(2) + ' раза (нужно '
      + need + '): затухание по расстоянию не отвечает на расстояние');
  }
}
fadeChecks(parts.mirror, 'отражение', (p) => Math.abs(p[1] - floorY));

const srcSizeMean = mean(world.clouds.flatMap(c => Array.from(c.geometry.attributes.size.array)));
const keep = mean(mirrorSize) / (srcSizeMean || 1);
const tiny = mirrorSize.filter(v => v < 1).length / (mirrorSize.length || 1);
console.log('отражение: средний размер точки к исходному ' + keep.toFixed(3)
  + ', мельче пикселя ' + (tiny * 100).toFixed(1) + '%');
if (keep < SIZE_KEEP_MIN) {
  bad('средний размер точки отражения ' + keep.toFixed(3) + ' от исходного (нужно '
    + SIZE_KEEP_MIN + '): тусклость сделана уменьшением размера, а ниже пикселя это не '
    + 'тусклая точка, а отсутствующая — прозрачность живёт в fade, не в size');
}
if (tiny > SIZE_TINY_MAX) {
  bad((tiny * 100).toFixed(1) + '% точек отражения мельче пикселя — до кадра они не дойдут');
}

const phase = pairs.length ? mean(pairs.map(p => Math.abs(p.offset - p.src.offset))) : 0;
console.log('отражение: средний сдвиг фазы пульсации ' + phase.toFixed(3)
  + ' по ' + pairs.length + ' парам');
if (phase < PHASE_DIFF_MIN) {
  bad('фаза пульсации отражения совпадает с миром (сдвиг ' + phase.toFixed(3) + ', нужно '
    + PHASE_DIFF_MIN + '): отражение будет мигать синхронно и читаться копией, а не отражением');
}

// ---- 3. плоскость пола: сетка, полоса, отклик на габарит ----------------------
if (parts.plane.length) {
  const pos = catPos(parts.plane);
  const off = pos.filter(p => Math.abs(p[1] - floorY) > height * PLANE_BAND).length;
  console.log('плоскость: точек ' + pos.length + ', вне полосы пола ' + off);
  if (off) {
    bad('плоскость пола: ' + off + ' точек лежат вне полосы ' + (PLANE_BAND * 100)
      + '% высоты мира вокруг линии пола — это уже не пол');
  }

  // Ровность шага требуется от РЕШЁТКИ, а не от всего рисунка пола. Правило писалось,
  // когда пол был только сеткой глифов; после N68 на нём ещё эмблемы, узор и длинные
  // дуги разметки, и требовать от них решётчатого шага — мерить не то. Если у точек
  // есть атрибут kind, берём только решётчатые роды; если нет — всё как раньше.
  const kindArr = parts.plane[0] && parts.plane[0].geometry.attributes.kind
    ? catOf(parts.plane, 'kind') : null;
  const latticeIdx = [];
  if (kindArr && Array.isArray(mod.FLOOR_MARK_KINDS)) {
    for (const nm of ['lattice', 'pattern']) {
      const i = mod.FLOOR_MARK_KINDS.indexOf(nm);
      if (i >= 0) latticeIdx.push(i);
    }
  }
  const gridPos = kindArr && latticeIdx.length
    ? pos.filter((p, i) => latticeIdx.includes(kindArr[i]))
    : pos;
  // Если родов на полу несколько, а решётчатых среди них нет — ровность шага проверять
  // не на чем, и требовать её значит мерить не то. Пока проверка стояла безусловно,
  // порча «один род рисунка» падала на ней вместо своей причины.
  const skipGrid = kindArr && latticeIdx.length > 0 && gridPos.length === 0;
  const xs = skipGrid ? null
    : [...new Set(gridPos.map(p => Math.round(p[0] * 100) / 100))].sort((a, b) => a - b);
  if (skipGrid) console.log('плоскость: решётчатых родов на полу нет, ровность шага не проверяется');
  const steps = xs ? xs.slice(1).map((v, i) => v - xs[i]) : [];
  const cv = steps.length ? std(steps) / (mean(steps) || 1) : 0;
  if (xs) console.log('плоскость: различных x ' + xs.length + ', неровность шага ' + cv.toFixed(4));
  if (xs && (xs.length < PLANE_GRID[0] || xs.length > PLANE_GRID[1])) {
    bad('плоскость пола: различных значений x ' + xs.length + ' (нужно ' + PLANE_GRID.join('..')
      + ') — просили сетку глифов, а это '
      + (xs.length > PLANE_GRID[1] ? 'случайная россыпь' : 'вырождение'));
  }
  if (xs && cv > PLANE_STEP_CV) {
    bad('плоскость пола: шаг сетки неровный (разброс ' + cv.toFixed(3) + ' > ' + PLANE_STEP_CV
      + ') — сетка читается сеткой только при ровном шаге');
  }
  const cxw = (world.group.userData.bounds.min[0] + world.group.userData.bounds.max[0]) / 2;
  const czw = (world.group.userData.bounds.min[2] + world.group.userData.bounds.max[2]) / 2;
  fadeChecks(parts.plane, 'плоскость', (p) => Math.hypot(p[0] - cxw, p[2] - czw));

  const gl = cat(parts.plane, 'glyph');
  const sz = cat(parts.plane, 'size');
  console.log('плоскость: различных глифов ' + new Set(gl).size + ', размер '
    + minOf(sz).toFixed(2) + '..' + maxOf(sz).toFixed(2));
  if (new Set(gl).size < GLYPH_DISTINCT_MIN) {
    bad('плоскость пола: различных глифов ' + new Set(gl).size + ' (нужно '
      + GLYPH_DISTINCT_MIN + ') — это сетка одного символа, не глифов');
  }
  if (!(minOf(sz) > 0)) bad('плоскость пола: есть точки размера 0 — их не видно');

  // ---- рисунок пола (задача N68) --------------------------------------------
  // Пол на референсе не пустое зеркало: по нему рассыпаны крупные знаки, идут длинные
  // дуги разметки, в зале лежит шахматная клетка. Проверки включаются, когда у точек
  // появился атрибут kind; как только в проекте есть src/world/marks.js, атрибут
  // становится обязательным — иначе пол молча останется сеткой одного размера.
  if (!kindArr && fs.existsSync('src/world/marks.js')) {
    bad('у точек плоскости пола нет атрибута kind: словарь знаков в проекте уже есть '
      + '(src/world/marks.js), а пол по-прежнему одна сетка. Референс требует на полу '
      + 'крупные знаки, разметку и узор');
  }
  if (kindArr) {
    const kinds = [...new Set(kindArr)];
    const sizes = catOf(parts.plane, 'size');
    const uniqSizes = [...new Set(sizes.map(v => Math.round(v * 100) / 100))];
    const mx = Math.max(...uniqSizes), mn = Math.min(...uniqSizes.filter(v => v > 0));
    console.log('рисунок пола: родов ' + kinds.length + ', масштабов ' + uniqSizes.length
      + ', разброс ' + (mx / mn).toFixed(1) + 'x');
    if (kinds.length < FLOOR_KINDS_MIN) {
      bad('на полу всего ' + kinds.length + ' родов рисунка, нужно от ' + FLOOR_KINDS_MIN
        + ' — одна россыпь знаков это не «пол, покрытый символами»');
    }
    if (uniqSizes.length < FLOOR_SCALES_MIN) {
      bad('на полу всего ' + uniqSizes.length + ' масштабов, нужно от ' + FLOOR_SCALES_MIN
        + ' — один размер на весь пол это обои');
    } else if (mx / mn < FLOOR_SCALE_SPREAD) {
      bad('разброс масштабов на полу ' + (mx / mn).toFixed(1) + 'x, нужно от '
        + FLOOR_SCALE_SPREAD + 'x: крупные знаки обязаны быть заметно крупнее мелкой россыпи');
    }

    // Разметка — связные ЛИНИИ, а не россыпь: за то она на референсе и отвечает,
    // что уводит взгляд вдоль улицы.
    // Смотрим пол ГОРОДА: разметка живёт вдоль улицы, и в открытом пространстве её
    // нет вовсе. Пока проверка шла по полу по умолчанию, порча «разметка россыпью»
    // проходила гейт насквозь — самопроверка это показала.
    const markIdx = Array.isArray(mod.FLOOR_MARK_KINDS) ? mod.FLOOR_MARK_KINDS.indexOf('marking') : -1;
    let cityPos = [], cityKind = [];
    if (markIdx >= 0) {
      try {
        const cf = mod.buildFloor(SEED, makeWorld(1, 'A'), { location: 'city' });
        const cp = [];
        cf.group.traverse(o => { if (o.isPoints && o.userData.floorPart === 'plane') cp.push(o); });
        cityPos = catPos(cp);
        cityKind = catOf(cp, 'kind');
      } catch (e) { bad('пол города не строится: ' + e.message); }
    }
    if (markIdx >= 0 && cityKind.includes(markIdx)) {
      const mp = cityPos.filter((p, i) => cityKind[i] === markIdx);
      if (mp.length > 20) {
        const mxs = mp.map(p => p[0]), mzs = mp.map(p => p[2]);
        const mux = mean(mxs), muz = mean(mzs);
        let sxx = 0, szz = 0, sxz = 0;
        for (let i = 0; i < mp.length; i++) {
          const dx = mxs[i] - mux, dz = mzs[i] - muz;
          sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
        }
        sxx /= mp.length; szz /= mp.length; sxz /= mp.length;
        const tr = sxx + szz;
        const disc = Math.max(0, tr * tr / 4 - (sxx * szz - sxz * sxz));
        const ratio = tr > 0 ? (tr / 2 + Math.sqrt(disc)) / tr : 0;
        console.log('разметка: доля разброса по главной оси ' + ratio.toFixed(3)
          + ' (нужно ' + MARKING_LINE_MIN + ')');
        if (ratio < MARKING_LINE_MIN) {
          bad('разметка рассыпана точками, а не идёт линиями: по главной оси всего '
            + (ratio * 100).toFixed(0) + '% разброса при пороге ' + (MARKING_LINE_MIN * 100)
            + '%. Разметка на референсе уводит взгляд вдоль улицы, россыпь так не умеет');
        }
      }
    }

    // Род рисунка меняется вместе с локацией: в городе разметка, в зале узор.
    try {
      const inCity = mod.buildFloor(SEED, makeWorld(1, 'A'), { location: 'city' });
      const inHall = mod.buildFloor(SEED, makeWorld(1, 'A'), { location: 'hall' });
      const kindsOf = (f) => {
        const out = new Set();
        f.group.traverse(o => {
          if (o.isPoints && o.userData.floorPart === 'plane' && o.geometry.attributes.kind) {
            for (const v of o.geometry.attributes.kind.array) out.add(v);
          }
        });
        return [...out].sort().join(',');
      };
      const a = kindsOf(inCity), b = kindsOf(inHall);
      console.log('рисунок по локациям: город [' + a + '], зал [' + b + ']');
      if (a === b) {
        bad('рисунок пола одинаков в городе и в зале — род рисунка обязан зависеть от '
          + 'локации: вдоль улицы разметка, в зале шахматная клетка');
      }
    } catch (e) {
      bad('проверка рисунка по локациям упала: ' + e.message);
    }
  }

  // отклик на габарит мира: вдвое шире мир — вдвое шире пол
  const wide = makeWorld(2, 'A');
  const wideFloor = mod.buildFloor(SEED, wide);
  const widePlane = [];
  wideFloor.group.traverse(o => {
    if (o.isPoints && o.userData.floorPart === 'plane') widePlane.push(o);
  });
  if (!widePlane.length) {
    bad('на вдвое большем мире плоскость пола не построена');
  } else {
    const spanOf = (list) => {
      const p = catPos(list);
      return maxOf(p.map(v => v[0])) - minOf(p.map(v => v[0]));
    };
    const resp = spanOf(widePlane) / (spanOf(parts.plane) || 1);
    console.log('плоскость: мир вдвое шире — пол шире в ' + resp.toFixed(2) + ' раза (допуск '
      + PLANE_SPAN_RESP.join('..') + ')');
    if (resp < PLANE_SPAN_RESP[0] || resp > PLANE_SPAN_RESP[1]) {
      bad('габарит мира удвоился, а пол изменился в ' + resp.toFixed(2) + ' раза (допуск '
        + PLANE_SPAN_RESP.join('..') + '): попадание в допуск на одном мире не значит, что '
        + 'габарит слушают — пол обязан накрывать мир любого размера');
    }
  }
  wideFloor.dispose();
}

// ---- 4. метка noReflect уважается --------------------------------------------
const mirroredStars = mirrorPos.filter(p => p[1] < 2 * floorY - 1500).length;
if (mirroredStars > mirrorPos.length * 0.02) {
  bad('отражён дальний план: ' + mirroredStars + ' точек пришли из облака с userData.noReflect '
    + '— звёзды на радиусе 2200 в отражении дают мусор под полом');
}

// ---- 5. шейдер объявляет и тянет fade ----------------------------------------
for (const p of [parts.mirror[0], parts.plane[0]].filter(Boolean)) {
  const tag = p.userData.floorPart;
  const vs = String(p.material.vertexShader || '');
  const fsrc = String(p.material.fragmentShader || '');
  const declared = /attribute\s+float\s+fade\s*;/.test(vs);
  const varyings = [...vs.matchAll(/varying\s+float\s+(\w+)\s*;/g)].map(m => m[1]);
  const carried = varyings.filter(v => new RegExp('\\b' + v + '\\s*=\\s*[^;]*\\bfade\\b').test(vs));
  const used = carried.some(v => new RegExp('\\b' + v + '\\b').test(fsrc));
  console.log(tag + ': шейдер объявляет fade — ' + declared + ', тянет через varying '
    + (carried.join(',') || 'нет') + ', читает во фрагменте — ' + used);
  if (!declared) {
    bad(tag + ': вершинный шейдер не объявляет `attribute float fade` — атрибут заполнен, '
      + 'но до кадра не доходит, затухание останется в данных');
  } else if (!used) {
    bad(tag + ': fade не доезжает до фрагментного шейдера (varying не найден или не читается) '
      + '— пол будет ровно ярким на всю глубину');
  }
  if (p.material.transparent !== true) {
    bad(tag + ': material.transparent не true — прозрачности не будет, пол закроет мир');
  }
  if (p.material.depthWrite !== false) {
    bad(tag + ': material.depthWrite не false — получим грязные серые квадраты вместо глифов '
      + '(это прямо перечислено в REFERENCE.md как «чего быть не должно»)');
  }
}

// ---- 6. детерминизм -----------------------------------------------------------
const again = mod.buildFloor(SEED, makeWorld(1, 'A'));
const snap = (f) => {
  const out = [];
  f.group.traverse(o => {
    if (!o.isPoints) return;
    for (const n of ['position', 'glyph', 'size', 'offset', 'fade']) {
      const a = o.geometry.attributes[n];
      if (a) out.push(n + ':' + Array.from(a.array).join(','));
    }
  });
  return out.join('|');
};
const s1 = snap(floor), s2 = snap(again);
console.log('детерминизм: слепок ' + s1.length + ' знаков, совпадает — ' + (s1 === s2));
if (s1 !== s2) bad('один сид дал разный пол: в построении есть Math.random или Date.now');
const other = mod.buildFloor('FLOOR-GATE-OTHER', makeWorld(1, 'A'));
if (snap(other) === s1) {
  bad('разные сиды дали побайтово одинаковый пол — сид в построении не участвует');
}
other.dispose();

// ---- 7. dispose освобождает --------------------------------------------------
const before = { ...THREE.disposals };
const kids = [];
again.group.traverse(o => { if (o.isPoints) kids.push(o); });
again.dispose();
const freedG = THREE.disposals.geometry - before.geometry;
const freedM = THREE.disposals.material - before.material;
console.log('dispose: освобождено геометрий ' + freedG + ', материалов ' + freedM + ' при '
  + kids.length + ' облаках, детей осталось ' + again.group.children.length);
if (freedG < kids.length) {
  bad('dispose освободил ' + freedG + ' геометрий из ' + kids.length
    + ' — при смене мира память утечёт');
}
if (freedM < 1) bad('dispose не освободил ни одного материала');
try { again.dispose(); } catch (e) { bad('повторный dispose бросил ' + e.message); }

report();
