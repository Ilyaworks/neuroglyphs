// Эталон договора о массе здания для самопроверки massing-check. ЭТО НЕ ПРОДУКТ.
//
// Масса собрана схематично: подиум из двух половин, между ними сквозной проём, над
// проёмом башня со сдвигом, крыло вбок, уступ наверху, мост к соседу.
//
// Порчи через globalThis.__MUTATE:
//   onebox    — масса из одной коробки: ровно то, что есть в проекте сейчас
//   apart     — части не пересекаются: три здания рядом вместо одного
//   boxy      — масса заполняет свой габарит: силуэт снова коробка
//   centered  — башня не сдвинута: выходит ступенчатая пирамида
//   noarch    — проёмов нет
//   blocked   — проём перекрыт частью массы: арка упирается в стену
//   nobridge  — мостов нет ни у кого
//   random    — Math.random вместо сеяного PRNG
import { mulberry32, strToSeed } from "../src/core/rng.js";

const M = () => globalThis.__MUTATE || "";
const PLAYER = 18;

export const PART_KINDS = ["podium", "tower", "wing", "setback", "cap"];

export function buildMassing(seedCode, language, area, opts = {}) {
  const mutate = M();
  const rng = mutate === "random" ? Math.random : mulberry32(strToSeed(String(seedCode) + ":mass:" + area.id));

  const fy = area.floorY;
  const hw = area.size[0] * 0.31, hd = area.size[2] * 0.31;
  const x0 = area.center[0] - hw, x1 = area.center[0] + hw;
  const z0 = area.center[2] - hd, z1 = area.center[2] + hd;
  const H = area.size[1];

  const parts = [];
  const openings = [];
  const bridges = [];

  if (mutate === "onebox") {
    parts.push({ kind: "podium", min: [x0, fy, z0], max: [x1, fy + H, z1] });
    return { parts, openings, bridges, bounds: boundsOf(parts) };
  }

  // Подиум РАЗРЕЗАН проёмом надвое: так арка выходит сквозной, а не нишей.
  const podH = fy + H * (0.24 + rng() * 0.08);
  const gap = Math.max(PLAYER * 3.4, (x1 - x0) * 0.26);
  const gx0 = area.center[0] - gap / 2, gx1 = area.center[0] + gap / 2;
  const band = H * 0.06;               // перемычка над проёмом
  const openH = podH - fy - band;

  if (mutate === "boxy") {
    parts.push({ kind: "podium", min: [x0, fy, z0], max: [x1, fy + H, z1] });
  } else {
    parts.push({ kind: "podium", min: [x0, fy, z0], max: [gx0, podH, z1] });
    parts.push({ kind: "podium", min: [gx1, fy, z0], max: [x1, podH, z1] });
    // Перемычка: срастается с обеими половинами и лежит ВЫШЕ проёма. Без неё половины
    // подиума остаются двумя отдельными зданиями, а не одним с аркой.
    parts.push({
      kind: "cap",
      min: [x0, podH - band, area.center[2] - (z1 - z0) * 0.3],
      max: [x1, podH + H * 0.05, area.center[2] + (z1 - z0) * 0.3],
    });
  }

  const spread = mutate === "apart" ? (x1 - x0) * 2.2 : 0;

  // Башня стоит НА ПОЛОВИНЕ подиума, а не над проёмом: над проёмом она дотягивалась
  // до его высоты и перекрывала проход, превращая арку в нишу.
  const shift = mutate === "centered" ? 0 : (x1 - x0) * (0.2 + rng() * 0.1);
  const tw = (x1 - x0) * 0.2, td = (z1 - z0) * 0.28;
  const tcx = area.center[0] + (mutate === "centered" ? 0 : shift + gap * 0.5);
  const tcz = area.center[2] + (rng() - 0.5) * (z1 - z0) * 0.2;
  const towerBottom = mutate === "boxy" ? fy : podH - H * 0.2;
  parts.push({
    kind: "tower",
    min: [tcx - tw + spread, towerBottom, tcz - td],
    max: [tcx + tw + spread, fy + H, tcz + td],
  });

  // Крыло: ниже башни, на другой половине подиума.
  const wingH = fy + H * (0.42 + rng() * 0.18);
  parts.push({
    kind: "wing",
    min: [x0 + spread * 2, fy, z0 + (z1 - z0) * 0.5],
    max: [gx0 + spread * 2, wingH, z1],
  });

  // Уступ наверху: ещё меньше и ещё сдвинут.
  parts.push({
    kind: "setback",
    min: [tcx - tw * 0.6 + shift * 0.3, fy + H * 0.78, tcz - td * 0.6],
    max: [tcx + tw * 0.6 + shift * 0.3, fy + H * (1.02 + rng() * 0.1), tcz + td * 0.6],
  });

  if (mutate !== "noarch") {
    openings.push({
      center: [area.center[0], fy, area.center[2]],
      width: gap,
      height: openH,
      axis: "z",
    });
  }
  if (mutate === "blocked") {
    parts.push({
      kind: "cap",
      min: [gx0 - 2, fy, area.center[2] - 4],
      max: [gx1 + 2, podH, area.center[2] + 4],
    });
  }

  if (mutate !== "nobridge" && Array.isArray(opts.neighbours) && opts.neighbours.length) {
    const n = opts.neighbours[0];
    bridges.push({
      from: [tcx, fy + H * 0.6, tcz],
      to: [n[0], fy + H * 0.6, n[2]],
      width: PLAYER * 2,
      height: PLAYER * 2.4,
    });
  }

  return { parts, openings, bridges, bounds: boundsOf(parts) };
}

function boundsOf(parts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let k = 0; k < 3; k++) {
      if (p.min[k] < min[k]) min[k] = p.min[k];
      if (p.max[k] > max[k]) max[k] = p.max[k];
    }
  }
  return { min, max };
}
