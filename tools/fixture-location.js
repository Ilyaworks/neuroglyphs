// Эталон договора о локациях для самопроверки location-check. ЭТО НЕ ПРОДУКТ.
//
// Здесь локации собраны схематично — коробками, кольцами и дугами. Задача эталона
// не в красоте, а в том, чтобы честно выполнять договор: тогда гейт можно проверить
// на нём и на порчах, и станет видно, кусается ли он.
//
// Порчи через globalThis.__MUTATE:
//   flying    — здания и колонны висят, не стоят на линии пола
//   blocked   — проход завален телами, пройти нельзя
//   onevariant— вариация не зависит от сида, локация всегда одна и та же
//   samesize  — все тела одного размера
//   noshape   — нарушено главное свойство вида: у башен нет наверший, у зала нет
//               потолка, у аркады арки не убывают, у туннеля кольца не соосны,
//               у воронки нет закрутки, у каньона ровные стены, у крон нет ветвления
//   random    — Math.random вместо сеяного PRNG
import { mulberry32, strToSeed } from "../src/core/rng.js";

const M = () => globalThis.__MUTATE || "";
const TAU = Math.PI * 2;

export const LOCATION_KINDS = [
  "city", "towers", "canyon", "hall", "arcade", "tunnel", "vortex", "crowns",
];

const FLOOR_Y = 0;
const DEPTH = 900;
const HALF = 320;

function box(x, y, z, w, h, d) {
  return { min: [x - w, y, z - d], max: [x + w, y + h, z + d] };
}

export function buildLocation(kind, seedCode, opts = {}) {
  if (!LOCATION_KINDS.includes(kind)) throw new Error("неизвестная локация: " + kind);
  const mutate = M();
  const rng = mutate === "random" ? Math.random : mulberry32(strToSeed(seedCode + ":" + kind));
  const floorY = opts.floorY !== undefined ? opts.floorY : FLOOR_Y;

  const variant = mutate === "onevariant" ? 0 : Math.floor(rng() * 3);
  const solids = [];
  const surfaces = [];
  const rings = [];
  const arches = [];
  const branches = [];
  let sphere = null;
  let ceiling = null;

  const lift = mutate === "flying" ? 120 : 0;
  const same = mutate === "samesize";
  const broken = mutate === "noshape";

  // Проход: осевой коридор вдоль -Z, свободный от тел. Если порча "blocked" — заваливаем.
  // Путь сквозь локацию. У зала он живёт ВНУТРИ помещения: зал замкнут, и путь
  // от края до края шёл бы сквозь переднюю стену.
  const path = [];
  const inner = kind === 'hall';
  for (let i = 0; i <= 8; i++) {
    const t = inner ? 0.12 + (i / 8) * 0.76 : i / 8;
    path.push([0, floorY + 8, -DEPTH * t]);
  }
  const CLEAR = 70;   // полуширина свободного прохода

  function place(x, z, w, h, d) {
    if (mutate !== "blocked" && Math.abs(x) < CLEAR + w) return false;
    solids.push(box(x, floorY + lift, z, same ? 40 : w, same ? 120 : h, same ? 40 : d));
    return true;
  }

  if (kind === "city" || kind === "towers" || kind === "canyon") {
    const n = 10 + Math.floor(rng() * 8);
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = side * (CLEAR + 40 + rng() * 180);
      const z = -rng() * DEPTH;
      if (kind === "towers") {
        const t = 14 + rng() * 10;                 // тонкая
        // Высота от ПОЛНОЙ толщины: box() строит тело в обе стороны от центра, и
        // отношение h/(2t) выходило вдвое меньше, чем казалось. Гейт поймал.
        const h = t * (13 + rng() * 8);
        place(x, z, same ? 40 : t, same ? 120 : h, same ? 40 : t);
        // Навершие: шире ствола и сидит наверху.
        if (!broken) {
          solids.push(box(x, floorY + lift + (same ? 120 : h), z,
            (same ? 40 : t) * 2.2, 18, (same ? 40 : t) * 2.2));
        }
      } else if (kind === "canyon") {
        // Стена-обрыв: слоями с разбросом по глубине, отсюда неровность.
        const layers = 5;
        for (let L = 0; L < layers; L++) {
          const jag = broken ? 0 : (rng() - 0.5) * 90;
          place(x + jag, z + L * 40 - 80, 60, 70 + L * 40, 30);
        }
      } else {
        place(x, z, 40 + rng() * 90, 90 + rng() * 300, 40 + rng() * 90);
      }
    }
    if (kind === "canyon") {
      sphere = { center: [rng() * 200 - 100, floorY + 900, -DEPTH * 0.9], radius: 260 };
    }
  }

  if (kind === "hall") {
    // Замкнутое помещение: четыре стены и потолок.
    const R = 300;
    solids.push(box(R, floorY, -DEPTH / 2, 30, 420, DEPTH / 2));
    solids.push(box(-R, floorY, -DEPTH / 2, 30, 420, DEPTH / 2));
    solids.push(box(0, floorY, 0, R, 420, 30));
    solids.push(box(0, floorY, -DEPTH, R, 420, 30));
    if (!broken) ceiling = { y: floorY + 420 };
    sphere = { center: [0, floorY + 180, -DEPTH / 2], radius: 150 };
    // Колонны вдоль стен
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      solids.push(box(side * (R - 60), floorY + lift, -80 - i * 90, 22, 300, 22));
    }
  }

  if (kind === "arcade") {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const z = -80 - i * 110;
      const scale = broken ? 1 : 1 - i * 0.06;   // убывание к дальней
      arches.push({ z, width: 220 * scale, height: 340 * scale, span: 110 });
      solids.push(box(150 * scale, floorY + lift, z, 26, 340 * scale, 26));
      solids.push(box(-150 * scale, floorY + lift, z, 26, 340 * scale, 26));
    }
  }

  if (kind === "tunnel" || kind === "vortex") {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const z = -i * 70;
      const r = 260 - i * (broken ? 0 : 9);
      const off = broken && kind === "tunnel" ? (rng() - 0.5) * 160 : 0;
      const twist = kind === "vortex" ? (broken ? 0 : i * 0.16) : 0;
      rings.push({ z, radius: r, center: [off, floorY + 200, z], twist });
    }
    if (kind === "vortex") sphere = { center: [0, floorY + 200, -n * 70], radius: 60, core: true };
    // Строки формул на стенке — две штуки, лежат на поверхности туннеля.
    surfaces.push({ type: 'cylinder', center: [0, floorY + 200, -DEPTH / 2], radius: 250, height: DEPTH,
      marks: ['formula', 'string', 'lattice'] });
  }

  if (kind === "crowns") {
    // Ветвление: ствол, ветви, веточки. Толщина убывает с каждым уровнем.
    function grow(x, y, z, thick, level) {
      branches.push({ level, thick, from: [x, y, z] });
      if (level >= 3 || (broken && level >= 1)) return;
      const kids = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < kids; k++) {
        const a = rng() * TAU;
        const len = 120 - level * 30;
        grow(x + Math.cos(a) * len, y + len, z + Math.sin(a) * len,
          broken ? thick : thick * 0.55, level + 1);
      }
    }
    // Дерево стоит В СТОРОНЕ от прохода: на оси оно перегораживало путь.
    grow(220, floorY, -DEPTH / 2, 40, 0);
    for (const b of branches) {
      solids.push(box(b.from[0], b.from[1], b.from[2], b.thick, b.thick * 2, b.thick));
    }
  }

  if (kind === "city" || kind === "towers" || kind === "canyon" || kind === "hall") {
    surfaces.push({ type: 'plane', origin: [-HALF, floorY, -DEPTH], u: [1, 0, 0], v: [0, 1, 0],
      w: HALF * 2, h: 300, marks: ['emblem', 'string', 'formula', 'lattice'] });
  }

  const bounds = {
    min: [-HALF * 2, floorY, -DEPTH - 100],
    max: [HALF * 2, floorY + 900, 100],
  };

  return { kind, variant, floorY, bounds, solids, surfaces, path, rings, arches, branches, sphere, ceiling };
}
