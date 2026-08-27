// Эталон договора о грамматике сборки для самопроверки grammar-check. ЭТО НЕ ПРОДУКТ.
//
// Правила собраны схематично: задача эталона не в красоте, а в честном выполнении
// договора, чтобы на нём было видно, кусается ли гейт.
//
// Порчи через globalThis.__MUTATE:
//   scatter  — копии разбросаны, постройка рассыпается в россыпь
//   flat     — ряд не убывает: анфилада перестаёт уходить вглубь
//   bent     — кольца не соосны: туннель ломается
//   lopsided — зеркало кривое: левая половина не отвечает правой
//   float    — стопка висит: между ярусами провалы
//   twins    — все правила дают одну и ту же расстановку
//   random   — Math.random вместо сеяного PRNG
import { mulberry32, strToSeed } from "../src/core/rng.js";

const M = () => globalThis.__MUTATE || "";
const TAU = Math.PI * 2;

export const RULES = ["row", "axis", "mirror", "stack", "grid", "fan"];

function boundsOf(places, foot) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of places) {
    for (let k = 0; k < 3; k++) {
      const h = foot[k] * p.scale * 0.5;
      if (p.at[k] - h < min[k]) min[k] = p.at[k] - h;
      if (p.at[k] + h > max[k]) max[k] = p.at[k] + h;
    }
  }
  return { min, max };
}

export function assemble(rule, element, seedCode, opts = {}) {
  if (!RULES.includes(rule)) throw new Error("неизвестное правило: " + rule);
  const mutate = M();
  const rng = mutate === "random" ? Math.random : mulberry32(strToSeed(String(seedCode) + ":" + rule));
  const foot = (element && element.footprint) || [40, 90, 30];
  // Сид решает размах: без этого расстановка одинакова во всех мирах, и гейт
  // справедливо скажет, что сид ни на что не влияет.
  const n = opts.count || 5 + Math.floor(rng() * 4);
  const spacing = 1.15 + rng() * 0.2;
  const fade = 0.3 + rng() * 0.35;
  const places = [];
  let axis = null;

  const use = mutate === "twins" ? "row" : rule;

  if (use === "row") {
    // Анфилада: копии в линию, каждая мельче предыдущей, шаг тоже убывает.
    let z = 0;
    for (let i = 0; i < n; i++) {
      const s = mutate === "flat" ? 1 : 1 - i * (fade / n);
      places.push({ at: [0, 0, z], scale: s, turn: 0, tiltY: 0 });
      z -= foot[2] * spacing * s;
    }
    axis = { from: [0, 0, 0], to: [0, 0, z] };
  } else if (use === "axis") {
    // Туннель: кольца одного размера, ровным шагом, центры на одной прямой.
    const step = foot[2] * spacing;
    for (let i = 0; i < n; i++) {
      const off = mutate === "bent" ? (rng() - 0.5) * foot[0] * 4 : 0;
      places.push({ at: [off, 0, -i * step], scale: 1, turn: 0, tiltY: 0 });
    }
    axis = { from: [0, 0, 0], to: [0, 0, -(n - 1) * step] };
  } else if (use === "mirror") {
    // Зал: пары слева и справа, отвечающие друг другу.
    const half = Math.max(2, Math.floor(n / 2));
    const x = foot[0] * 2.2;
    let z = 0;
    for (let i = 0; i < half; i++) {
      const s = 1 - i * (fade * 0.7 / half);
      places.push({ at: [-x, 0, z], scale: s, turn: 0, tiltY: 0 });
      const skew = mutate === "lopsided" ? foot[0] * 1.3 : 0;
      places.push({ at: [x + skew, 0, z], scale: s, turn: 0, tiltY: 0 });
      z -= foot[2] * spacing * s;
    }
    axis = { from: [0, 0, 0], to: [0, 0, z] };
  } else if (use === "stack") {
    // Башня: ярус на ярусе, без зазоров, каждый меньше нижнего.
    let y = 0;
    for (let i = 0; i < n; i++) {
      const s = 1 - i * (fade * 1.1 / n);
      const h = foot[1] * s;
      const gap = mutate === "float" ? h * 0.9 : 0;
      places.push({ at: [0, y + gap + h / 2, 0], scale: s, turn: 0, tiltY: 0 });
      y += h + gap;
    }
    axis = { from: [0, 0, 0], to: [0, y, 0] };
  } else if (use === "grid") {
    // Кварталы: ровная сетка по плану.
    const side = Math.max(2, Math.round(Math.sqrt(n)));
    const sx = foot[0] * spacing, sz = foot[2] * spacing;
    for (let i = 0; i < side; i++) {
      for (let j = 0; j < side; j++) {
        places.push({
          at: [(i - (side - 1) / 2) * sx, 0, -(j) * sz],
          scale: 1, turn: 0, tiltY: 0,
        });
      }
    }
  } else {
    // Веер: повтор вокруг одной точки, лицом к ней. Радиус подобран так, чтобы дуга
    // между соседями равнялась ширине элемента со шагом — по кругу копии стоят
    // ШИРИНОЙ, потому что развёрнуты лицом к середине.
    const r = (foot[0] * spacing * n) / TAU;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      places.push({ at: [Math.cos(a) * r, 0, Math.sin(a) * r], scale: 1, turn: a + Math.PI / 2, tiltY: 0 });
    }
  }

  if (mutate === "scatter") {
    // Разносим копии далеко друг от друга: постройка перестаёт быть постройкой.
    const spread = Math.max(...foot) * 9;
    for (let i = 0; i < places.length; i++) {
      places[i].at[0] += (i % 3 - 1) * spread;
      places[i].at[1] += (i % 2) * spread * 0.5;
      places[i].at[2] += ((i * 7) % 5 - 2) * spread;
    }
  }

  return { rule, places, bounds: boundsOf(places, foot), axis, footprint: foot };
}
