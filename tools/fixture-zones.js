// Эталон договора о зонах для самопроверки zones-check. ЭТО НЕ ПРОДУКТ.
//
// Порчи через globalThis.__MUTATE:
//   overlap     — зоны налезают друг на друга объёмами
//   nojoint     — стыков между зонами нет, зоны просто стоят рядом
//   monotone    — почти всегда одна зона: распределение по сидам сломано
//   figuresout  — дополнительные фигуры лежат вне своих зон
//   portalfloat — портал висит не в последней зоне
//   random      — Math.random вместо сеяного PRNG
import { mulberry32, strToSeed } from "../src/core/rng.js";

const M = () => globalThis.__MUTATE || "";

export const ZONE_KINDS = [
  "city", "towers", "canyon", "hall", "arcade", "tunnel", "vortex", "crowns",
];

const VARIANTS = 3;      // у каждой локации не меньше трёх вариаций
const DEPTH = 900;       // длина зоны вдоль пути
const HALF = 320;        // половина ширины и высоты зоны
const JOINT = 90;        // глубина переходной полосы на стыке

export function buildZones(seedCode, opts = {}) {
  const mutate = M();
  const rng = mutate === "random" ? Math.random : mulberry32(strToSeed(seedCode + ":zones"));

  // Сколько зон и насколько они разные. Доли неравномерные и это часть договора:
  // большинство миров — из разных локаций, одиночные редки.
  const roll = rng();
  let plan;
  if (mutate === "monotone") plan = { count: 1, same: false };
  else if (roll < 0.20) plan = { count: 1, same: false };
  else if (roll < 0.30) plan = { count: 2, same: true };
  else plan = { count: roll < 0.72 ? 2 : 3, same: false };

  const zones = [];
  const firstKind = Math.floor(rng() * ZONE_KINDS.length);
  for (let i = 0; i < plan.count; i++) {
    const kind = plan.same
      ? ZONE_KINDS[firstKind]
      : ZONE_KINDS[(firstKind + i * (1 + Math.floor(rng() * 3))) % ZONE_KINDS.length];
    const z0 = i * DEPTH;
    const overlap = mutate === "overlap" ? DEPTH * 0.6 : 0;
    zones.push({
      kind,
      variant: Math.floor(rng() * VARIANTS),
      bounds: {
        min: [-HALF, -HALF, z0 - overlap],
        max: [HALF, HALF, z0 + DEPTH],
      },
      entry: [0, 0, z0],
      exit: [0, 0, z0 + DEPTH],
    });
  }

  // Зоны одного вида должны быть РАЗНЫМИ вариациями, иначе это одна зона, разрезанная надвое.
  if (plan.same && zones.length > 1 && zones[1].variant === zones[0].variant) {
    zones[1].variant = (zones[0].variant + 1) % VARIANTS;
  }

  const joints = [];
  if (mutate !== "nojoint") {
    for (let i = 1; i < zones.length; i++) {
      const z = i * DEPTH;
      joints.push({ a: i - 1, b: i, band: { min: z - JOINT, max: z + JOINT } });
    }
  }

  // Путь от точки входа до портала: по одной точке в каждой зоне плюс концы.
  const path = [[0, 0, 0]];
  for (const z of zones) path.push([0, 0, (z.bounds.min[2] + z.bounds.max[2]) / 2]);
  const last = zones[zones.length - 1];
  path.push([0, 0, last.exit[2]]);

  const portal = mutate === "portalfloat"
    ? [0, 0, last.exit[2] + DEPTH * 3]
    : [0, 0, last.exit[2] - 40];

  // Дополнительные фигуры: где-то ни одной, где-то несколько. Ставятся ВНУТРИ зоны и
  // не лезут в стык, иначе фигура разрывается переходом.
  const figures = [];
  const n = Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const zi = Math.floor(rng() * zones.length);
    const z = zones[zi];
    const mid = (z.bounds.min[2] + z.bounds.max[2]) / 2;
    const pos = mutate === "figuresout"
      ? [HALF * 3, 0, mid]
      : [(rng() - 0.5) * HALF, (rng() - 0.5) * HALF, mid + (rng() - 0.5) * (DEPTH / 2 - JOINT * 2)];
    figures.push({ name: "figure" + i, zone: zi, position: pos });
  }

  return { zones, joints, path, portal, figures };
}
