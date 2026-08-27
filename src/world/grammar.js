// Грамматика сборки: как элементы складываются в постройку.
//
// Арка — это элемент. Аркада — это арка, повторённая рядом с убыванием вглубь. Туннель —
// кольцо, повторённое по оси. Зал — две аркады, поставленные зеркально друг напротив
// друга. Башня — ярус на ярусе. Кварталы — сетка по плану.
//
// Грамматика НЕ ЗНАЕТ, что повторяет. Ей приходит габарит элемента, и одно правило
// работает с любой формой языка: арка, плита, кольцо, купол. В этом всё дело — иначе
// пришлось бы писать сборку заново под каждую форму.
//
// Модуль не импортирует three: наружу выходят числа.
//
// Договор:
//   assemble(rule, element, seedCode, opts) -> { rule, places, bounds, axis, footprint }
//   element — { footprint: [w, h, d] }
//   place   — { at:[x,y,z], scale, turn, tiltY }
//
// Уговор о повороте, без которого замер и расстановка расходятся молча: turn — поворот
// копии вокруг оси Y, местная точка (x,z) переходит в мировую
// (x·cos t − z·sin t, x·sin t + z·cos t). Значит местное +z смотрит в мире в
// (−sin t, cos t): именно этим и разворачивают элемент "лицом" куда надо.
import { mulberry32, strToSeed } from "../core/rng.js";

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
  if (!places.length) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

export function assemble(rule, element, seedCode, opts = {}) {
  if (!RULES.includes(rule)) throw new Error("неизвестное правило сборки: " + rule);
  const rng = mulberry32(strToSeed(String(seedCode) + ":grammar:" + rule));
  const foot = (element && element.footprint) || [40, 90, 30];

  // Размах решает сид, но снаружи его можно задать: город ставит аркаду нужной длины,
  // а не ту, что выпала.
  const n = opts.count || 5 + Math.floor(rng() * 5);
  // Шаг не больше полутора габаритов элемента: при большем зазор между соседями
  // перерастает их собственный полуразмер, и постройка распадается на отдельно
  // стоящие предметы. Это и есть разница между аркадой и рядом столбов.
  const spacing = 1.15 + rng() * 0.2;
  const fade = 0.25 + rng() * 0.4;

  const places = [];
  let axis = null;

  if (rule === "row") {
    // Анфилада. Убывает и размер, и шаг: так ряд читается уходящим вглубь ещё до того,
    // как за дело возьмётся перспектива.
    let z = 0;
    for (let i = 0; i < n; i++) {
      const s = 1 - (i / Math.max(1, n - 1)) * fade;
      places.push({ at: [0, 0, z], scale: s, turn: 0, tiltY: 0 });
      z -= foot[2] * spacing * s;
    }
    axis = { from: [0, 0, 0], to: [0, 0, z] };
  } else if (rule === "axis") {
    // Туннель: кольца одного размера, ровным шагом, центры строго на прямой. Кольцо
    // стоит ПОПЕРЁК хода — за это отвечает tiltY, а не расстановка.
    const step = foot[2] * spacing;
    const twist = rng() < 0.5 ? 0 : 0.06 + rng() * 0.14;
    for (let i = 0; i < n; i++) {
      places.push({ at: [0, 0, -i * step], scale: 1, turn: i * twist, tiltY: Math.PI / 2 });
    }
    axis = { from: [0, 0, 0], to: [0, 0, -(n - 1) * step] };
  } else if (rule === "mirror") {
    // Зал: две аркады лицом друг к другу. Между ними неф — проход, ради которого зал
    // и существует. Ширина нефа от сида, но не уже двух габаритов: иначе не пройти.
    const half = Math.max(2, Math.floor(n / 2) + 1);
    const nave = foot[0] * (1.6 + rng() * 1.4);
    // Колонны развёрнуты лицом в неф, значит вдоль хода они простираются на СВОЮ ШИРИНУ,
    // а не на глубину. Шаг считается по повёрнутому габариту — иначе колоннада из
    // широких элементов расползается, а из узких налезает сама на себя.
    const along = foot[0];
    let z = 0;
    for (let i = 0; i < half; i++) {
      const s = 1 - (i / Math.max(1, half - 1)) * fade * 0.8;
      // Лицом В НЕФ: у левой колоннады местное +z смотрит в +x, у правой в −x.
      places.push({ at: [-nave, 0, z], scale: s, turn: -Math.PI / 2, tiltY: 0 });
      places.push({ at: [nave, 0, z], scale: s, turn: Math.PI / 2, tiltY: 0 });
      z -= along * spacing * s;
    }
    axis = { from: [0, 0, 0], to: [0, 0, z] };
  } else if (rule === "stack") {
    // Башня: ярус на ярусе, без зазоров. Каждый ярус меньше нижнего и повёрнут —
    // от поворота башня перестаёт быть стопкой одинаковых коробок.
    const twist = rng() * 0.5;
    let y = 0;
    for (let i = 0; i < n; i++) {
      const s = 1 - (i / Math.max(1, n - 1)) * fade * 1.2;
      const h = foot[1] * s;
      places.push({ at: [0, y + h / 2, 0], scale: s, turn: i * twist, tiltY: 0 });
      y += h;
    }
    axis = { from: [0, 0, 0], to: [0, y, 0] };
  } else if (rule === "grid") {
    // Кварталы: сетка по плану. Шаг ровный — по нему и читаются улицы.
    const side = Math.max(2, Math.round(Math.sqrt(n)) + (rng() < 0.4 ? 1 : 0));
    const street = 1.15 + rng() * 0.25;
    const sx = foot[0] * street, sz = foot[2] * street;
    for (let i = 0; i < side; i++) {
      for (let j = 0; j < side; j++) {
        places.push({
          at: [(i - (side - 1) / 2) * sx, 0, -j * sz],
          scale: 1, turn: 0, tiltY: 0,
        });
      }
    }
    axis = { from: [0, 0, 0], to: [0, 0, -(side - 1) * sz] };
  } else {
    // Веер: повтор вокруг одной точки, лицом к ней. Радиус берётся из числа копий,
    // чтобы соседи стояли вплотную и при трёх штуках, и при десяти.
    // Веер: копии развёрнуты лицом к середине, значит по кругу они стоят СВОЕЙ ШИРИНОЙ.
    // Радиус подбирается так, чтобы дуга между соседями равнялась ширине со шагом.
    const r = (foot[0] * spacing * n) / TAU;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      // Лицом К СЕРЕДИНЕ: местное +z направлено внутрь круга. Прежний поворот −a
      // разворачивал копии куда попало, и по кругу они вставали не шириной, а глубиной —
      // веер расползался. Широкий прогон поймал это на широком плоском элементе.
      places.push({
        at: [Math.cos(a) * r, 0, Math.sin(a) * r],
        scale: 1, turn: a + Math.PI / 2, tiltY: 0,
      });
    }
    axis = { from: [0, 0, 0], to: [0, foot[1], 0] };
  }

  return { rule, places, bounds: boundsOf(places, foot), axis, footprint: foot };
}

// Габарит собранной постройки — нужен городу, чтобы ставить постройки рядом и не
// внахлёст. Возвращается вместе с расстановкой, но пусть будет и отдельно.
export function assemblySize(built) {
  const b = built.bounds;
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
}
