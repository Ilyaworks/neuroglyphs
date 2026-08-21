// Отбирает формы, которые попадают в мир, и пересобирает src/world/fieldShapes.js.
// Запуск: node tools/pick-dense-shapes.mjs
//
// Берёт ВЕСЬ набор (старые 169 + новые из каталога) и оставляет формы, которые:
//   1) не «тонкая струнка в пустоте»  — заполненность объёма >= MIN_OCC;
//   2) не «одна тонкая оболочка»      — радиальный пик <= MAX_PEAK;
//   3) либо объёмные, либо со сгущением в центре — occ >= GOOD_OCC или core >= GOOD_CORE;
//   4) не похожи на уже отобранную форму — расстояние между отпечатками > MIN_DIST.
//
// Отпечаток формы: три гистограммы (радиус, угол вокруг Y, высота), 52 доли.
// Расстояние — сумма модулей разностей (L1). Так отсеиваются откровенные дубли
// вроде torusWave7 и torusWave8, которые различаются только числом в имени.
import fs from 'node:fs';
import { ALL_SHAPES, ALL_SHAPE_KEYS } from '../src/world/allShapes.js';

const MIN_OCC = 0.12, MAX_PEAK = 0.45, GOOD_OCC = 0.15, GOOD_CORE = 0.15, MIN_DIST = 0.35;
const P = {
  radius: 60, flatten: 0.8, distPow: 0.8, tubeR: 10, arms: 4, twist: 4, spread: 0.6,
  thickness: 8, strands: 3, turns: 4, clusterCount: 6, clusterRadius: 12,
  freq: 0.3, amp: 8, knotP: 3, knotQ: 4,
};
const N = 4000, G = 16;

function measure(fn) {
  const out = [0, 0, 0], pts = [];
  for (let i = 0; i < N; i++) {
    out[0] = out[1] = out[2] = 0;
    try { fn(i, P, out); } catch { return null; }
    if (!out.every(Number.isFinite)) return null;
    pts.push([out[0], out[1], out[2]]);
  }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const q of pts) for (let d = 0; d < 3; d++) {
    if (q[d] < mn[d]) mn[d] = q[d];
    if (q[d] > mx[d]) mx[d] = q[d];
  }
  const cells = new Set();
  for (const q of pts) {
    let idx = 0;
    for (let d = 0; d < 3; d++) {
      const span = (mx[d] - mn[d]) || 1;
      idx = idx * G + Math.min(G - 1, Math.floor((q[d] - mn[d]) / span * G));
    }
    cells.add(idx);
  }
  const rs = pts.map(q => Math.hypot(q[0], q[1], q[2]));
  const rmax = Math.max(...rs) || 1;
  const hr = new Array(20).fill(0), ha = new Array(16).fill(0), hz = new Array(16).fill(0);
  const zs = pts.map(q => q[2]);
  const zmin = Math.min(...zs), zspan = (Math.max(...zs) - zmin) || 1;
  pts.forEach((q, i) => {
    hr[Math.min(19, Math.floor(rs[i] / rmax * 20))]++;
    ha[Math.min(15, Math.floor((Math.atan2(q[1], q[0]) + Math.PI) / (2 * Math.PI) * 16))]++;
    hz[Math.min(15, Math.floor((q[2] - zmin) / zspan * 16))]++;
  });
  const share = hr.map(v => v / pts.length);
  return {
    occ: cells.size / (G * G * G),
    core: share.slice(0, 5).reduce((a, b) => a + b, 0),
    peak: Math.max(...share),
    print: [...hr, ...ha, ...hz].map(v => v / pts.length),
  };
}

const dist = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);

const measured = [];
const rejected = { broken: [], thread: [], shell: [], flat: [], dup: [] };
for (const k of ALL_SHAPE_KEYS) {
  const m = measure(ALL_SHAPES[k]);
  if (!m) { rejected.broken.push(k); continue; }
  if (m.occ < MIN_OCC) { rejected.thread.push(k); continue; }
  if (m.peak > MAX_PEAK) { rejected.shell.push(k); continue; }
  if (m.occ < GOOD_OCC && m.core < GOOD_CORE) { rejected.flat.push(k); continue; }
  measured.push({ k, ...m });
}

// сначала самые выразительные: объём плюс ядро
measured.sort((a, b) => (b.occ + b.core) - (a.occ + a.core));
const kept = [];
for (const s of measured) {
  const near = kept.find(x => dist(x.print, s.print) <= MIN_DIST);
  if (near) { rejected.dup.push(s.k + ' ~ ' + near.k); continue; }
  kept.push(s);
}

const body = kept.map(s => `  '${s.k}',${' '.repeat(Math.max(1, 24 - s.k.length))}// объём ${s.occ.toFixed(3)}  ядро ${s.core.toFixed(3)}`).join('\n');
fs.writeFileSync('src/world/fieldShapes.js',
`// Формы, которые попадают в мир. Файл собирается автоматически.
//
// Источник — весь набор (старые 169 из legacyShapes.js + новые из shapeCatalog.js).
// Правила отбора: не нить (объём >= ${MIN_OCC}), не одна оболочка (пик <= ${MAX_PEAK}),
// есть объём или сгущение в центре (объём >= ${GOOD_OCC} либо ядро >= ${GOOD_CORE}),
// и форма не похожа на уже отобранную (расстояние отпечатков > ${MIN_DIST}).
//
// Пересобрать: node tools/pick-dense-shapes.mjs
export const FIELD_SHAPE_KEYS = [
${body}
];
`);

console.log(`всего форм в наборе : ${ALL_SHAPE_KEYS.length}`);
console.log(`отобрано в мир      : ${kept.length}`);
console.log(`  отсеяно как нить     : ${rejected.thread.length}`);
console.log(`  отсеяно как оболочка : ${rejected.shell.length}`);
console.log(`  без объёма и ядра    : ${rejected.flat.length}`);
console.log(`  откровенные дубли    : ${rejected.dup.length}`);
if (rejected.broken.length) console.log(`  сломаны (NaN/ошибка) : ${rejected.broken.length} — ${rejected.broken.join(' ')}`);
console.log('\nпримеры отброшенных дублей:');
for (const d of rejected.dup.slice(0, 10)) console.log('   ' + d);
