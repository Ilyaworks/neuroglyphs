// Эталон договора о зале для самопроверки hall-check. ЭТО НЕ ПРОДУКТ.
//
// Зал собран схематично: задача эталона не в красоте, а в честном выполнении договора,
// чтобы на нём было видно, кусается ли гейт.
//
// Порчи через globalThis.__MUTATE:
//   open       — стены нет: зал перестаёт быть залом
//   lopsided   — правая колоннада сдвинута: зеркало кривое
//   offcenter  — сфера уехала с оси
//   blocked    — колонна встала посреди нефа: не пройти
//   plainfloor — пол без шахматной клетки
//   hidden     — сферу загородили: из точки входа её не видно
//   random     — Math.random вместо сеяного PRNG
import { mulberry32, strToSeed } from "../src/core/rng.js";

const M = () => globalThis.__MUTATE || "";

export function buildHall(seedCode, language, opts = {}) {
  const mutate = M();
  const rng = mutate === "random" ? Math.random : mulberry32(strToSeed(String(seedCode) + ":hall"));

  const floorY = opts.floorY || 0;
  const nave = 140 + rng() * 60;          // полуширина нефа
  const bays = 5 + Math.floor(rng() * 3); // сколько пролётов в аркаде
  const bay = 150;                        // шаг пролёта
  const colW = 46, colD = 46, colH = 300;
  const depth = bays * bay;
  const wallX = nave + colW * 2.2;
  const wallH = colH * 1.45;

  const columns = [];
  for (let i = 0; i < bays; i++) {
    const z = -bay * (i + 0.5);
    const s = 1 - i * 0.04;
    columns.push({ at: [-nave, floorY, z], scale: s, turn: -Math.PI / 2, form: "slab" });
    const skew = mutate === "lopsided" ? colW * 1.6 : 0;
    columns.push({ at: [nave + skew, floorY, z], scale: s, turn: Math.PI / 2, form: "slab" });
  }
  if (mutate === "blocked") {
    columns.push({ at: [0, floorY, -depth * 0.45], scale: 1, turn: 0, form: "slab" });
  }

  // Арки поверх колонн: перекрывают пролёт между соседними опорами.
  const arches = [];
  for (let i = 0; i < bays - 1; i++) {
    const z = -bay * (i + 1);
    for (const side of [-1, 1]) {
      arches.push({ at: [side * nave, floorY + colH, z], scale: 1, turn: side * Math.PI / 2, form: "arch", span: bay });
    }
  }

  const sphere = {
    center: [mutate === "offcenter" ? nave * 1.4 : 0, floorY + 150, -depth * 0.55],
    radius: 110,
  };

  // Ограждение: две продольные стены, дальняя поперечная, ближняя с проёмом.
  const walls = [];
  if (mutate !== "open") {
    walls.push({ origin: [-wallX, floorY, -depth], u: [0, 0, 1], v: [0, 1, 0], w: depth, h: wallH });
  }
  walls.push({ origin: [wallX, floorY, -depth], u: [0, 0, 1], v: [0, 1, 0], w: depth, h: wallH });
  walls.push({ origin: [-wallX, floorY, -depth], u: [1, 0, 0], v: [0, 1, 0], w: wallX * 2, h: wallH });
  if (mutate === "hidden") {
    // Глухая перегородка поперёк нефа перед сферой.
    walls.push({ origin: [-nave, floorY, -depth * 0.3], u: [1, 0, 0], v: [0, 1, 0], w: nave * 2, h: wallH });
  }

  // Ближняя стена с проёмом: два простенка по краям, между ними вход. Без неё зал
  // открыт спереди во всю ширину, и замкнутым его считать не за что.
  const gateW = nave * 1.6;
  const jamb = wallX - gateW / 2;
  if (jamb > 1) {
    walls.push({ origin: [-wallX, floorY, 0], u: [1, 0, 0], v: [0, 1, 0], w: jamb, h: wallH });
    walls.push({ origin: [gateW / 2, floorY, 0], u: [1, 0, 0], v: [0, 1, 0], w: jamb, h: wallH });
  }

  const gates = [
    { center: [0, floorY, 0], width: gateW, height: colH, normal: [0, 0, 1] },
  ];

  const floorPlan = {
    origin: [-wallX, floorY, -depth],
    u: [1, 0, 0], v: [0, 0, 1],
    w: wallX * 2, h: depth,
    cell: mutate === "plainfloor" ? 0 : Math.min(wallX * 2, depth) / 12,
  };

  const eye = [0, floorY + 8, bay * 0.35];

  return {
    floorY,
    bounds: { min: [-wallX, floorY, -depth], max: [wallX, floorY + wallH, bay * 0.5] },
    axis: { from: [0, floorY, 0], to: [0, floorY, -depth] },
    eye,
    columns,
    arches,
    sphere,
    walls,
    gates,
    floorPlan,
    naveHalfWidth: nave,
    element: { footprint: [colW, colH, colD] },
    surfaces: [
      { role: "sphere", spec: { type: "sphere", center: sphere.center, radius: sphere.radius },
        marks: ["lattice", "string", "formula"] },
      { role: "wall", spec: { type: "plane", origin: [-wallX, floorY, -depth], u: [0, 0, 1], v: [0, 1, 0], w: depth, h: wallH },
        marks: ["string", "lattice", "formula", "edge"] },
    ],
  };
}
