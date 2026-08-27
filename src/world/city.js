// План города: из чего он состоит и как по нему пройти.
//
// Слова человека 27.08.2026: «должен быть город, где различные постройки, лабиринты,
// предметы»; «это кольца и сети, могут быть тупики, но не длинные, дойти до портала
// можно несколькими путями».
//
// Город — это НЕ цепочка комнат. Разница между цепочкой и сетью одна и она решающая:
// к выходу ведёт больше одной дороги. Отсюда и способ построения — участки растут
// КОМПАКТНЫМ пятном, а не змейкой: у пятна на сетке кольца заводятся сами, у змейки
// не заводятся никогда.
//
// Модуль не импортирует three: наружу выходят числа.
import { mulberry32, strToSeed } from "../core/rng.js";

const PLAYER = 18;
const CELL = 560;          // шаг сетки участков
const AREA = CELL * 0.86;  // сам участок чуть меньше клетки: между ними остаются стены

export const AREA_KINDS = ["hall", "street", "colonnade", "tower", "court", "tunnel", "yard", "gallery"];

// Каким правилом грамматики застраивается участок. Зал — зеркалом, улица — решёткой,
// колоннада и галерея — рядом, башня — стопкой, двор — веером, туннель — осью.
export const AREA_RULE = {
  hall: "mirror", street: "grid", colonnade: "row", tower: "stack",
  court: "fan", tunnel: "axis", yard: "grid", gallery: "row",
};

const key = (i, j) => i + ":" + j;
const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function buildCity(seedCode, language, opts = {}) {
  const rng = mulberry32(strToSeed(String(seedCode) + ":city"));
  const floorY = opts.floorY !== undefined ? opts.floorY : 0;
  const want = opts.count || 9 + Math.floor(rng() * 4);

  // ── пятно ───────────────────────────────────────────────────────────────────
  // Растём от середины, всякий раз предпочитая клетку, у которой БОЛЬШЕ занятых
  // соседей. Так выходит пятно с кольцами, а не змейка: у змейки к выходу всегда
  // одна дорога, и город превращается в коридор с комнатами.
  const chosen = new Map();
  chosen.set(key(0, 0), [0, 0]);
  while (chosen.size < want) {
    const front = new Map();
    for (const [i, j] of chosen.values()) {
      for (const [di, dj] of NEIGH) {
        const k = key(i + di, j + dj);
        if (chosen.has(k)) continue;
        front.set(k, (front.get(k) || 0) + 1);
      }
    }
    if (!front.size) break;
    let best = 0;
    for (const v of front.values()) if (v > best) best = v;
    const ties = [...front.entries()].filter(([, v]) => v === best).map(([k]) => k);
    const pickKey = ties[Math.floor(rng() * ties.length)];
    const [pi, pj] = pickKey.split(":").map(Number);
    chosen.set(pickKey, [pi, pj]);
  }

  const cells = [...chosen.values()];

  // ── участки ─────────────────────────────────────────────────────────────────
  // Зал ровно один и стоит не у входа: он предмет города, к нему идут.
  const kinds = AREA_KINDS.filter((k) => k !== "hall");
  const areas = cells.map(([i, j], id) => {
    const kind = kinds[Math.floor(rng() * kinds.length)];
    return {
      id, kind, rule: AREA_RULE[kind], cell: [i, j],
      center: [i * CELL, floorY, -j * CELL],
      size: [AREA, 340 + rng() * 200, AREA],
      floorY,
    };
  });

  // ── связи ───────────────────────────────────────────────────────────────────
  const index = new Map();
  areas.forEach((a) => index.set(key(a.cell[0], a.cell[1]), a));
  const links = [];
  for (const a of areas) {
    const [i, j] = a.cell;
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      const b = index.get(key(i + di, j + dj));
      if (!b) continue;
      links.push({
        a: a.id, b: b.id,
        gate: {
          center: [(a.center[0] + b.center[0]) / 2, floorY, (a.center[2] + b.center[2]) / 2],
          width: Math.max(PLAYER * 3.4, CELL * 0.26),
          height: Math.min(a.size[1], b.size[1]) * 0.6,
        },
      });
    }
  }

  // Длинные тупики убираем: лист, чей сосед сам не развилка, — это хвост из двух
  // комнат, а человек допустил только короткие. Срезаем такие листья, пока не станет
  // чисто; участков от этого меньше не станет ниже нижней границы — пятно компактно.
  const degree = () => {
    const d = new Map(areas.map((a) => [a.id, 0]));
    for (const l of links) { d.set(l.a, d.get(l.a) + 1); d.set(l.b, d.get(l.b) + 1); }
    return d;
  };
  for (let pass = 0; pass < 4; pass++) {
    const d = degree();
    const leaf = areas.find((a) => d.get(a.id) === 1
      && [...links].some((l) => (l.a === a.id || l.b === a.id)
        && d.get(l.a === a.id ? l.b : l.a) <= 2));
    if (!leaf || areas.length <= 8) break;
    const gone = leaf.id;
    areas.splice(areas.indexOf(leaf), 1);
    for (let k = links.length - 1; k >= 0; k--) if (links[k].a === gone || links[k].b === gone) links.splice(k, 1);
  }

  // ── вход, выход, зал ────────────────────────────────────────────────────────
  // Вход и выход обязаны стоять НА КОЛЬЦЕ. Если выход поставить в самую дальнюю
  // клетку, ею почти всегда оказывается кончик пятна с одним соседом — и к порталу
  // ведёт ровно одна дорога, то есть город снова цепочка. Поэтому пара выбирается
  // так, чтобы между ней шли два пути, не делящих ни одного прохода.
  const dist = (a, b) => Math.abs(a.cell[0] - b.cell[0]) + Math.abs(a.cell[1] - b.cell[1]);
  const deg = degree();
  const routesBetween = (from, to) => {
    const cap = new Map(), nb = new Map();
    const kk = (x, y) => x + '>' + y;
    for (const a of areas) nb.set(a.id, []);
    for (const l of links) {
      if (!cap.has(kk(l.a, l.b))) { cap.set(kk(l.a, l.b), 0); nb.get(l.a).push(l.b); }
      if (!cap.has(kk(l.b, l.a))) { cap.set(kk(l.b, l.a), 0); nb.get(l.b).push(l.a); }
      cap.set(kk(l.a, l.b), cap.get(kk(l.a, l.b)) + 1);
      cap.set(kk(l.b, l.a), cap.get(kk(l.b, l.a)) + 1);
    }
    let flow = 0;
    for (let it = 0; it < 3; it++) {
      const prev = new Map([[from, null]]);
      const q = [from];
      let hit = false;
      while (q.length && !hit) {
        const u = q.shift();
        for (const v of nb.get(u) || []) {
          if (prev.has(v) || cap.get(kk(u, v)) <= 0) continue;
          prev.set(v, u);
          if (v === to) { hit = true; break; }
          q.push(v);
        }
      }
      if (!hit) break;
      let v = to;
      while (prev.get(v) !== null && prev.get(v) !== undefined) {
        const u = prev.get(v);
        cap.set(kk(u, v), cap.get(kk(u, v)) - 1);
        cap.set(kk(v, u), cap.get(kk(v, u)) + 1);
        v = u;
      }
      flow++;
      if (flow >= 2) break;
    }
    return flow;
  };

  const ring = areas.filter((a) => deg.get(a.id) >= 2);
  const pool = ring.length >= 2 ? ring : areas;
  const start = pool.reduce((m, a) => (a.cell[1] > m.cell[1] ? a : m), pool[0]);
  const far = pool.slice().sort((p, q) => dist(q, start) - dist(p, start));
  const end = far.find((a) => a !== start && routesBetween(start.id, a.id) >= 2) || far[0];
  const mid = areas
    .filter((a) => a !== start && a !== end)
    .sort((p, q) => Math.abs(dist(p, start) - dist(p, end)) - Math.abs(dist(q, start) - dist(q, end)))[0];
  if (mid) { mid.kind = "hall"; mid.rule = AREA_RULE.hall; }

  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const a of areas) {
    for (let k = 0; k < 3; k++) {
      const h = a.size[k] / 2;
      if (a.center[k] - h < min[k]) min[k] = a.center[k] - h;
      if (a.center[k] + h > max[k]) max[k] = a.center[k] + h;
    }
  }
  min[1] = floorY;

  return {
    areas, links,
    spawn: start.id,
    portal: end.id,
    hall: mid ? mid.id : null,
    bounds: { min, max },
    floorY,
    cell: CELL,
  };
}
