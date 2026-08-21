// Пересобирает src/world/fieldShapes.js — список форм, которые попадают в мир.
// Критерий: заполненность объёма не ниже MIN_OCC (см. tools/shape-check.mjs).
// Запуск: node tools/pick-dense-shapes.mjs [порог]
import fs from 'node:fs';
import { SHAPES, SHAPE_KEYS } from '../src/world/shapeCatalog.js';

const MIN_OCC = Number(process.argv[2]) || 0.15;
const P = {
  radius: 60, flatten: 0.8, distPow: 0.8, tubeR: 10, arms: 4, twist: 4, spread: 0.6,
  thickness: 8, strands: 3, turns: 4, clusterCount: 6, clusterRadius: 12,
  freq: 0.3, amp: 8, knotP: 3, knotQ: 4,
};
const N = 6000, G = 16;

function occupancy(fn) {
  const out = [0, 0, 0], pts = [];
  for (let i = 0; i < N; i++) {
    out[0] = out[1] = out[2] = 0;
    fn(i, P, out);
    if (!out.every(Number.isFinite)) return 0;
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
  return cells.size / (G * G * G);
}

const kept = SHAPE_KEYS.map(k => [k, occupancy(SHAPES[k])])
  .filter(([, o]) => o >= MIN_OCC)
  .sort((a, b) => b[1] - a[1]);

const body = kept.map(([k, o]) => `  '${k}',${' '.repeat(Math.max(1, 22 - k.length))}// ${o.toFixed(3)}`).join('\n');
fs.writeFileSync('src/world/fieldShapes.js',
`// Формы глифового поля: только достаточно плотные.
//
// Список отобран по метрике заполненности объёма из tools/shape-check.mjs:
// доля занятых ячеек в сетке 16x16x16 должна быть не ниже ${MIN_OCC}. Разряженные формы
// («тонкая струнка глифов в пустоте») в мир не попадают, хотя и остаются в каталоге.
//
// Пересобрать список: node tools/pick-dense-shapes.mjs [порог]
export const FIELD_SHAPE_KEYS = [
${body}
];
`);
console.log(`порог ${MIN_OCC}: отобрано ${kept.length} форм из ${SHAPE_KEYS.length}`);
console.log('не попали:', SHAPE_KEYS.filter(k => !kept.some(([n]) => n === k)).join(' '));
