// Осязаемость: сквозь стены не пройти, по полу ходят.
//
// Провалиться здесь можно тремя способами, и два из них хуже, чем полное отсутствие
// столкновений. Камера, встающая колом у любой стены, делает мир неиграбельным.
// Угол-ловушка запирает игрока навсегда. Обе беды выглядят как «столкновения работают»
// и ловятся только отдельной проверкой — этим и занят tools/collide-check.mjs.
//
// Приём простой и проверенный: движение разбирается ПО ОСЯМ. Сначала пробуем сдвинуться
// по x, потом по z. Если одна ось упёрлась, вторая всё равно едет — отсюда и скольжение
// вдоль стены, и выход из угла по диагонали. Пробовать сразу обе оси и откатывать всё
// целиком — это как раз тот способ, при котором игрок встаёт колом.
import { mulberry32, strToSeed } from "../core/rng.js";

const PLAYER_RADIUS = 7;    // полуширина игрока
const PLAYER_EYE = 8;       // высота глаз над полом

export function buildCollider(seedCode, opts = {}) {
  const rng = mulberry32(strToSeed(String(seedCode) + ":collide"));
  const floorY = opts.floorY !== undefined ? opts.floorY : -40;
  const radius = opts.radius !== undefined ? opts.radius : PLAYER_RADIUS;
  const eye = opts.eye !== undefined ? opts.eye : PLAYER_EYE;

  const boxes = [];
  if (Array.isArray(opts.solids) && opts.solids.length) {
    // Тела приходят снаружи: город знает свои стены лучше, чем модуль столкновений.
    for (const b of opts.solids) {
      if (Array.isArray(b.min) && Array.isArray(b.max)) boxes.push(b);
    }
  } else {
    // Города ещё нет — ставим свою россыпь построек, чтобы столкновениям было обо что
    // проверяться. Расстановка сеяная: тот же сид даёт те же тела.
    const n = 5 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const cx = (rng() - 0.5) * 900;
      const cz = -120 - rng() * 800;
      const w = 40 + rng() * 90, d = 40 + rng() * 90, h = 120 + rng() * 260;
      boxes.push({ min: [cx - w, floorY, cz - d], max: [cx + w, floorY + h, cz + d] });
    }
  }

  // Точка входа держится ПОДАЛЬШЕ от тел. Появиться замурованным — худший из отказов:
  // игрок не понимает, что случилось, и уходит.
  let spawn = opts.spawn ? opts.spawn.slice() : [0, floorY + eye, 0];
  if (isBlocked(spawn[0], spawn[1], spawn[2])) {
    outer: for (let ring = 1; ring < 40; ring++) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const x = spawn[0] + Math.cos(a) * ring * 40;
        const z = spawn[2] + Math.sin(a) * ring * 40;
        if (!isBlocked(x, spawn[1], z)) { spawn = [x, spawn[1], z]; break outer; }
      }
    }
  }

  function isBlocked(x, y, z) {
    if (y < floorY) return true;
    for (const b of boxes) {
      if (x > b.min[0] - radius && x < b.max[0] + radius
        && z > b.min[2] - radius && z < b.max[2] + radius
        && y > b.min[1] - 1 && y < b.max[1]) return true;
    }
    return false;
  }

  function resolve(from, to, out) {
    // Пол — тоже препятствие: ниже линии пола игрок не опускается.
    let y = to[1];
    if (y < floorY + 1) y = floorY + 1;

    let x = from[0], z = from[2];
    // Сначала одна ось, потом другая — от этого и берутся скольжение и выход из угла.
    if (!isBlocked(to[0], y, z)) x = to[0];
    if (!isBlocked(x, y, to[2])) z = to[2];
    // Если по одной оси не вышло, пробуем вторую от НОВОГО положения: так игрок
    // обтекает угол, а не застревает в нём.
    if (x === from[0] && !isBlocked(from[0], y, to[2])) z = to[2];
    if (z === from[2] && !isBlocked(to[0], y, from[2])) x = to[0];

    // Если новое место всё равно занято (игрок уже стоял в теле — так бывает при
    // подгрузке), оставляем как было: выталкивать вслепую опаснее, чем не двигать.
    if (isBlocked(x, y, z)) { x = from[0]; z = from[2]; }

    out[0] = x; out[1] = y; out[2] = z;
    return out;
  }

  // Высота пола под точкой: по ней игрок и шагает. Пока пол один, но крыши и уступы
  // придут сюда же, и ходьба их подхватит без правок.
  function groundAt(x, z) {
    let top = floorY;
    for (const b of boxes) {
      if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2]) {
        if (b.max[1] > top && b.max[1] - floorY < 60) top = b.max[1];
      }
    }
    return top;
  }

  return { blocked: isBlocked, resolve, groundAt, spawn, floorY, eye, boxes };
}
