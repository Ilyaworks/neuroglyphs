// Эталон договора об осязаемости для самопроверки collide-check. ЭТО НЕ ПРОДУКТ.
//
// Порчи через globalThis.__MUTATE:
//   ghost       — движение не встречает препятствий, сквозь стены пролетаем
//   sticky      — при упоре камера встаёт колом, скольжения вдоль стены нет
//   trap        — из угла между двумя стенами не выбраться
//   spawninside — точка входа оказывается внутри стены
//   random      — Math.random вместо сеяного PRNG
import { mulberry32, strToSeed } from "../src/core/rng.js";

const M = () => globalThis.__MUTATE || "";

// Тела: коробки, выровненные по осям. Этого хватает и зданиям, и колоннам, и стенам
// зала; кривые поверхности загрубляются до коробок, потому что игроку нужна не точная
// физика, а невозможность пройти насквозь.
export function buildCollider(seedCode, opts = {}) {
  const mutate = M();
  const rng = mutate === "random" ? Math.random : mulberry32(strToSeed(seedCode + ":collide"));

  const floorY = opts.floorY !== undefined ? opts.floorY : -40;
  const boxes = [];

  // Тела приходят СНАРУЖИ, если их дали: город знает свои стены лучше, чем модуль
  // столкновений. Своя расстановка остаётся на случай, когда города ещё нет.
  if (Array.isArray(opts.solids) && opts.solids.length) {
    for (const b of opts.solids) boxes.push(b);
  } else {
    // Две стены, сходящиеся углом: на них проверяется упор, скольжение и выход из угла.
    boxes.push({ min: [40, floorY, -400], max: [90, floorY + 300, 40] });
    boxes.push({ min: [-400, floorY, 40], max: [90, floorY + 300, 90] });
  }

  // Ещё несколько тел от сида — здания вокруг.
  const n = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const cx = (rng() - 0.5) * 900;
    const cz = -200 - rng() * 900;
    const w = 40 + rng() * 90;
    const d = 40 + rng() * 90;
    const h = 80 + rng() * 260;
    boxes.push({ min: [cx - w, floorY, cz - d], max: [cx + w, floorY + h, cz + d] });
  }

  if (mutate === "spawninside") {
    boxes.push({ min: [-60, floorY, -60], max: [60, floorY + 200, 60] });
  }

  const PAD = 2;   // игрок не точка: держим его на расстоянии от поверхности

  function inBox(b, x, y, z) {
    return x > b.min[0] - PAD && x < b.max[0] + PAD
      && y > b.min[1] - PAD && y < b.max[1] + PAD
      && z > b.min[2] - PAD && z < b.max[2] + PAD;
  }

  function blocked(x, y, z) {
    if (mutate === "ghost") return false;
    if (y < floorY + PAD) return true;          // пол — частный случай препятствия
    for (const b of boxes) if (inBox(b, x, y, z)) return true;
    return false;
  }

  // Куда игрок попадёт на самом деле. Если прямой путь свободен — туда. Если нет,
  // движение раскладывается по осям и берётся то, что проходит: это и есть скольжение
  // вдоль стены. Без него игрок залипает в углу и не может выбраться, а это хуже, чем
  // пройти насквозь.
  function resolve(from, to, out) {
    if (mutate === "ghost") { out[0] = to[0]; out[1] = to[1]; out[2] = to[2]; return out; }

    if (!blocked(to[0], to[1], to[2])) {
      out[0] = to[0]; out[1] = to[1]; out[2] = to[2];
      return out;
    }

    if (mutate === "sticky") {
      // Упор без скольжения: встали колом у любой стены.
      out[0] = from[0]; out[1] = from[1]; out[2] = from[2];
      return out;
    }

    // Ловушка: у самого угла между двумя стенами движение не проходит ВООБЩЕ, ни в
    // какую сторону. Вдоль одиночной стены при этом всё скользит как надо — потому
    // ловушка и не ловится проверкой скольжения, для неё нужна отдельная.
    if (mutate === "trap" && from[0] > 0 && from[2] > 0 && from[0] < 200 && from[2] < 200) {
      out[0] = from[0]; out[1] = from[1]; out[2] = from[2];
      return out;
    }

    let x = from[0], y = from[1], z = from[2];
    if (!blocked(to[0], y, z)) x = to[0];
    if (!blocked(x, y, to[2])) z = to[2];
    if (!blocked(x, to[1], z)) y = to[1];
    out[0] = x; out[1] = y; out[2] = z;
    return out;
  }

  const spawn = [0, floorY + 8, 0];

  return { blocked, resolve, spawn, floorY, cellSize: PAD * 2, bodies: boxes.length };
}
