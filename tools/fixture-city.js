// Эталон договора о городе для самопроверки city-check. ЭТО НЕ ПРОДУКТ.
//
// План города собран схематично: сетка участков, часть выброшена, соседние связаны
// проходами. Задача эталона не в красоте, а в честном выполнении договора.
//
// Порчи через globalThis.__MUTATE:
//   few       — участков меньше восьми
//   chain     — цепочка вместо сети: к порталу один путь
//   deadend   — длинный тупик: два тупиковых участка подряд
//   overlap   — участки налезают друг на друга
//   narrow    — проходы уже трёх ростов
//   floating  — проход не на общей грани, а посреди участка
//   random    — Math.random вместо сеяного PRNG
import { mulberry32, strToSeed } from "../src/core/rng.js";

const M = () => globalThis.__MUTATE || "";

export const AREA_KINDS = ["hall", "street", "colonnade", "tower", "court", "tunnel", "yard", "gallery"];

const PLAYER = 18;
const CELL = 520;

export function buildCity(seedCode, language, opts = {}) {
  const mutate = M();
  const rng = mutate === "random" ? Math.random : mulberry32(strToSeed(String(seedCode) + ":city"));
  const floorY = opts.floorY || 0;

  // План: сетка 4x3, из неё берутся клетки. Кольцо получается само, если брать
  // связную область, а не цепочку.
  const cols = 4, rows = 3;
  const want = mutate === "few" ? 5 : 9 + Math.floor(rng() * 4);
  const taken = [];
  const order = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) order.push([i, j]);
  // Обход змейкой даёт связность; для цепочки берём только первый ряд.
  const pool = mutate === "chain" ? order.filter(([, j]) => j === 0) : order;
  // Одна клетка выбрасывается по сиду: без этого план одинаков на всех сидах, и порча
  // «Math.random вместо сеяного PRNG» проходит гейт молча — менять-то нечего.
  const skip = Math.floor(rng() * pool.length);
  for (let k = 0; k < pool.length; k++) {
    if (taken.length >= want) break;
    if (k === skip && pool.length > want) continue;
    taken.push(pool[k]);
  }
  if (mutate === "deadend") {
    // Отросток из двух участков подряд, висящий на одном соседе.
    taken.push([cols, 0]);
    taken.push([cols + 1, 0]);
  }

  const kindShift = Math.floor(rng() * AREA_KINDS.length);
  const key = (i, j) => i + ":" + j;
  const index = new Map();
  const areas = taken.map(([i, j], k) => {
    const overlap = mutate === "overlap" ? CELL * 0.5 : 0;
    const a = {
      id: k,
      kind: AREA_KINDS[(k + kindShift) % AREA_KINDS.length],
      cell: [i, j],
      center: [i * CELL - overlap * (i % 2), floorY, -j * CELL],
      size: [CELL * 0.9, 320, CELL * 0.9],
      floorY,
    };
    index.set(key(i, j), a);
    return a;
  });

  const links = [];
  for (const a of areas) {
    const [i, j] = a.cell;
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      const b = index.get(key(i + di, j + dj));
      if (!b) continue;
      const w = mutate === "narrow" ? PLAYER * 1.2 : PLAYER * 4.5;
      const cx = mutate === "floating" ? a.center[0] : (a.center[0] + b.center[0]) / 2;
      const cz = mutate === "floating" ? a.center[2] : (a.center[2] + b.center[2]) / 2;
      links.push({ a: a.id, b: b.id, gate: { center: [cx, floorY, cz], width: w, height: 200 } });
    }
  }

  const spawn = areas[0].id;
  const portal = areas[areas.length - 1].id;

  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const a of areas) {
    for (let k = 0; k < 3; k++) {
      const h = a.size[k] / 2;
      if (a.center[k] - h < min[k]) min[k] = a.center[k] - h;
      if (a.center[k] + h > max[k]) max[k] = a.center[k] + h;
    }
  }

  return { areas, links, spawn, portal, bounds: { min, max }, floorY };
}
