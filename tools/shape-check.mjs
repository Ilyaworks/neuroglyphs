// Проверка каталога форм: заполненность объёма, наличие ядра и кольца, концентрация.
// Запуск: node tools/shape-check.mjs
//
// Зачем: глазами не отличить «форму» от «тонкой струнки глифов в пустоте».
// Метрики считаются по облаку из 6000 точек с фиксированными параметрами.
//
//   заполн  — доля занятых ячеек в сетке 16x16x16 по габаритам облака.
//             Ниже 0.12 — это нить или каркас, объёма нет.
//   центр   — доля точек ближе 0.25 от максимального радиуса.
//             Ниже 0.05 — середина пустая.
//   кольцо  — доля точек дальше 0.60 максимального радиуса.
//   пик     — доля точек в самой населённой из 20 радиальных корзин.
//             Выше 0.45 — всё сбилось в одну тонкую оболочку.
import { SHAPES, SHAPE_KEYS } from '../src/world/shapeCatalog.js';

const LIMITS = { occ: 0.12, core: 0.05, peak: 0.45 };
const P = {
  radius: 60, flatten: 0.8, distPow: 0.8, tubeR: 10, arms: 4, twist: 4, spread: 0.6,
  thickness: 8, strands: 3, turns: 4, clusterCount: 6, clusterRadius: 12,
  freq: 0.3, amp: 8, knotP: 3, knotQ: 4,
};
const N = 6000, G = 16;

function measure(fn) {
  const out = [0, 0, 0], pts = [];
  for (let i = 0; i < N; i++) {
    out[0] = out[1] = out[2] = 0;
    fn(i, P, out);
    if (!out.every(Number.isFinite)) return { bad: 'NaN на i=' + i };
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
  const bins = new Array(20).fill(0);
  for (const r of rs) bins[Math.min(19, Math.floor(r / rmax * 20))]++;
  const share = bins.map(v => v / pts.length);
  return {
    occ: cells.size / (G * G * G),
    core: share.slice(0, 5).reduce((a, b) => a + b, 0),
    ring: share.slice(12).reduce((a, b) => a + b, 0),
    peak: Math.max(...share),
  };
}

const f = n => n.toFixed(3);
const rows = [], failed = [];
for (const k of SHAPE_KEYS) {
  const m = measure(SHAPES[k]);
  if (m.bad) { failed.push(k + ' — ' + m.bad); continue; }
  const why = [];
  if (m.occ < LIMITS.occ) why.push('нить (заполн ' + f(m.occ) + ')');
  if (m.peak > LIMITS.peak) why.push('одна оболочка (пик ' + f(m.peak) + ')');
  // Пустая середина — не отказ: в сцене центр всегда занят ядром (buildNeuralCore).
  const note = m.core < LIMITS.core ? 'пустая середина (центр ' + f(m.core) + ')' : '';
  rows.push({ k, ...m, why, note });
  if (why.length) failed.push(k + ' — ' + why.join(', '));
}

rows.sort((a, b) => a.occ - b.occ);
console.log('форма'.padEnd(20) + 'заполн  центр  кольцо  пик');
for (const r of rows) {
  console.log(r.k.padEnd(20) + [r.occ, r.core, r.ring, r.peak].map(f).join('  ') + (r.why.length ? '   <-- ' + r.why.join(', ') : r.note ? '   (' + r.note + ')' : ''));
}
const coreRing = rows.filter(r => r.core >= 0.15 && r.ring >= 0.25 && r.occ >= 0.15);
console.log('');
console.log('форм всего              : ' + SHAPE_KEYS.length);
console.log('отказ при: заполн<' + LIMITS.occ + ' или пик>' + LIMITS.peak + ' (центр<' + LIMITS.core + ' — только пометка)');
console.log('семейство ядро+кольцо   : ' + (coreRing.length ? coreRing.map(r => r.k).join(' ') : 'ни одной'));
console.log('не проходят проверку    : ' + failed.length);
for (const s of failed) console.log('   ' + s);
process.exit(failed.length ? 1 : 0);
