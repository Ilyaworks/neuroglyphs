// Отбирает формы для мира и пересобирает src/world/fieldShapes.js.
// Запуск: node tools/pick-dense-shapes.mjs
//
// Берёт весь набор (старые 169 из legacyShapes.js + новые из shapeCatalog.js)
// и делит отобранное на ДВЕ группы:
//
//   CORE_RING_SHAPES — сфера (светило) в середине и кольцо вокруг:
//                      ядро >= CORE_MIN и кольцо >= RING_MIN;
//   VARIED_SHAPES    — разные формы, сгущение в центре НЕ требуется.
//
// Общий барьер качества для обеих групп:
//   не «тонкая струнка в пустоте» — объём >= MIN_OCC;
//   не «одна тонкая оболочка»     — радиальный пик <= MAX_PEAK;
//   у второй группы дополнительно: объём >= VARIED_OCC либо ядро >= VARIED_CORE,
//   чтобы не набрать бледных полупустых форм.
//
// Дубли убираются ВНУТРИ каждой группы отдельно: формы «ядро плюс кольцо» неизбежно
// похожи друг на друга, и сравнивать их с пейзажами бессмысленно. Отпечаток формы —
// три гистограммы (радиус, угол вокруг Y, высота), расстояние — сумма модулей разностей.
import fs from 'node:fs';
import { ALL_SHAPES, ALL_SHAPE_KEYS } from '../src/world/allShapes.js';

const MIN_OCC = 0.12, MAX_PEAK = 0.45;
const CORE_MIN = 0.15, RING_MIN = 0.25;
// Провал плотности между ядром и кольцом не требуется для попадания в группу,
// но считается и печатается: >= 1.3 означает настоящее «светило с кольцом».
const GAP_TRUE_STAR = 1.3;
const VARIED_OCC = 0.15, VARIED_CORE = 0.15;
const DIST_CORE_RING = 0.15;   // внутри звёздной группы допускаем большее сходство
const DIST_VARIED = 0.35;      // среди разных форм требуем заметного различия

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
  // Средняя плотность по трём радиальным зонам: ядро, промежуток, кольцо.
  const avg = arr => arr.reduce((x, y) => x + y, 0) / arr.length;
  const coreAvg = avg(share.slice(0, 5)), gapAvg = avg(share.slice(5, 12)), ringAvg = avg(share.slice(12));
  return {
    occ: cells.size / (G * G * G),
    core: share.slice(0, 5).reduce((a, b) => a + b, 0),
    ring: share.slice(12).reduce((a, b) => a + b, 0),
    // Во сколько раз ядро и кольцо плотнее промежутка между ними.
    // Больше единицы с запасом — это именно светило и кольцо, а не равномерное облако.
    gapCore: coreAvg / (gapAvg || 1e-9),
    gapRing: ringAvg / (gapAvg || 1e-9),
    peak: Math.max(...share),
    print: [...hr, ...ha, ...hz].map(v => v / pts.length),
  };
}

const dist = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);

const coreRing = [], varied = [];
const rejected = { broken: [], thread: [], shell: [], pale: [], dup: [] };

for (const k of ALL_SHAPE_KEYS) {
  const m = measure(ALL_SHAPES[k]);
  if (!m) { rejected.broken.push(k); continue; }
  if (m.occ < MIN_OCC) { rejected.thread.push(k); continue; }
  if (m.peak > MAX_PEAK) { rejected.shell.push(k); continue; }
  if (m.core >= CORE_MIN && m.ring >= RING_MIN) { coreRing.push({ k, ...m }); continue; }
  if (m.occ < VARIED_OCC && m.core < VARIED_CORE) { rejected.pale.push(k); continue; }
  varied.push({ k, ...m });
}

function dedupe(list, minDist) {
  list.sort((a, b) => (b.occ + b.core) - (a.occ + a.core));
  const kept = [];
  for (const s of list) {
    const near = kept.find(x => dist(x.print, s.print) <= minDist);
    if (near) { rejected.dup.push(`${s.k} ~ ${near.k}`); continue; }
    kept.push(s);
  }
  return kept;
}

const keptCore = dedupe(coreRing, DIST_CORE_RING);
const keptVaried = dedupe(varied, DIST_VARIED);

const fmt = s => `  '${s.k}',${' '.repeat(Math.max(1, 24 - s.k.length))}// объём ${s.occ.toFixed(3)}  ядро ${s.core.toFixed(3)}  кольцо ${s.ring.toFixed(3)}  провал ${Math.min(s.gapCore, s.gapRing).toFixed(1)}x`;

fs.writeFileSync('src/world/fieldShapes.js',
`// Формы, которые попадают в мир. Файл собирается автоматически:
// node tools/pick-dense-shapes.mjs
//
// Источник — весь набор: старые 169 (legacyShapes.js) + новые (shapeCatalog.js + shapePatch.js).
// Общий барьер: не нить (объём >= ${MIN_OCC}) и не одна оболочка (пик <= ${MAX_PEAK}).

// Группа 1: плотное ядро в середине и внешнее кольцо — ядро >= ${CORE_MIN}, кольцо >= ${RING_MIN}.
// Колонка «провал» показывает, во сколько раз ядро и кольцо плотнее промежутка между ними.
// Настоящее «светило с кольцом» — это провал >= ${GAP_TRUE_STAR}; сейчас такому условию
// отвечает только mushroom, остальные формы группы — облака с тяжёлым центром.
export const CORE_RING_SHAPES = [
${keptCore.map(fmt).join('\n')}
];

// Разные формы. Сгущение в центре здесь НЕ требуется;
// нужен либо объём (>= ${VARIED_OCC}), либо ядро (>= ${VARIED_CORE}), чтобы форма не была бледной.
export const VARIED_SHAPES = [
${keptVaried.map(fmt).join('\n')}
];

export const FIELD_SHAPE_KEYS = [...CORE_RING_SHAPES, ...VARIED_SHAPES];
`);

console.log(`всего форм в наборе      : ${ALL_SHAPE_KEYS.length}`);
console.log(`ядро и внешнее кольцо    : ${keptCore.length}`);
console.log(`разные формы             : ${keptVaried.length}`);
console.log(`итого в мире             : ${keptCore.length + keptVaried.length}`);
console.log(`  отсеяно как нить       : ${rejected.thread.length}`);
console.log(`  отсеяно как оболочка   : ${rejected.shell.length}`);
console.log(`  бледные                : ${rejected.pale.length}`);
console.log(`  дубли внутри групп     : ${rejected.dup.length}`);
if (rejected.broken.length) console.log(`  сломаны                : ${rejected.broken.join(' ')}`);
console.log('\nгруппа «сфера + кольцо»:');
console.log('   ' + keptCore.map(s => s.k).join(' '));
const trueStars = keptCore.filter(s => Math.min(s.gapCore, s.gapRing) >= GAP_TRUE_STAR);
console.log(`с настоящим провалом (>= ${GAP_TRUE_STAR}): ${trueStars.length ? trueStars.map(s => s.k).join(' ') : 'ни одной'}`);
