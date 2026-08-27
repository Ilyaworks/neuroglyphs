// Эталон договора о причудливых формах для самопроверки strange-check. ЭТО НЕ ПРОДУКТ.
//
// Двенадцать форм собраны схематично: задача эталона не в красоте, а в честном
// выполнении договора, чтобы на нём можно было проверить, кусается ли гейт.
//
// Порчи через globalThis.__MUTATE:
//   twins    — все формы рисуются одинаково
//   scatter  — форма рассыпается: вместо предмета россыпь по всему габариту
//   few      — форм меньше десяти
//   flat     — все формы вырождаются в плоскость, объёма нет
//   random   — Math.random вместо сеяного PRNG
import { mulberry32, strToSeed } from "../src/core/rng.js";

const M = () => globalThis.__MUTATE || "";
const TAU = Math.PI * 2;

const ALL = [
  "mobius",        // лента Мёбиуса: одна строка, читается без конца
  "clockRings",    // часы без стрелок: кольца, повёрнутые друг относительно друга
  "ribs",          // рёбра: ряд арок вдаль, как грудная клетка кита
  "waterfall",     // водопад символов с брызгами у пола
  "hive",          // улей: соты из шестиугольных ячеек
  "rift",          // разлом: трещина, из которой торчат знаки чужого мира
  "pendulum",      // маятник: качающаяся нить и след на полу
  "obelisk",       // обелиск с осыпающейся надписью
  "ulamSpiral",    // спираль Улама: простые числа ярче остальных
  "hourglass",     // песочные часы: пересыпание через перемычку
  "planetRings",   // кольца планеты вокруг тёмного ядра
  "penroseStairs", // лестница Пенроуза, замкнутая сама на себя
];

export const STRANGE_FORMS = () => (M() === "few" ? ALL.slice(0, 7) : ALL);

const R = 100;   // условный габарит формы

export function buildStrange(name, seedCode, opts = {}) {
  const list = STRANGE_FORMS();
  if (!list.includes(name)) throw new Error("неизвестная форма: " + name);
  const mutate = M();
  const rng = mutate === "random" ? Math.random : mulberry32(strToSeed(seedCode + ":" + name));
  const count = opts.count || 2000;

  // Сид сдвигает форму, но не ломает её: одна и та же форма на разных сидах остаётся
  // собой, меняются пропорции и мелочи.
  const wobble = 0.85 + rng() * 0.3;
  const phase = rng() * TAU;

  function fill(i, out) {
    const t = i / count;
    if (mutate === "twins") { blob(t, phase, out); return out; }
    switch (name) {
      case "mobius": mobius(t, wobble, out); break;
      case "clockRings": clockRings(i, count, wobble, out); break;
      case "ribs": ribs(i, count, wobble, out); break;
      case "waterfall": waterfall(i, count, t, out); break;
      case "hive": hive(i, count, out); break;
      case "rift": rift(i, count, t, out); break;
      case "pendulum": pendulum(i, count, t, out); break;
      case "obelisk": obelisk(i, count, t, out); break;
      case "ulamSpiral": ulam(i, count, out); break;
      case "hourglass": hourglass(i, count, t, out); break;
      case "planetRings": planetRings(i, count, wobble, out); break;
      case "penroseStairs": penrose(i, count, out); break;
      default: blob(t, phase, out);
    }
    if (mutate === "scatter") {
      // Рассыпается КУСКАМИ, а не равномерным шумом: равномерное облако связно и
      // проверку на «один предмет» проходит. Форму разносит на семь далёких обломков.
      const k = i % 7;
      const a = (k / 7) * TAU;
      out[0] += Math.cos(a) * R * 9;
      out[1] += (k - 3) * R * 5;
      out[2] += Math.sin(a) * R * 9;
    }
    if (mutate === "flat") out[2] = 0;
    return out;
  }

  return { name, count, fill };
}

function blob(t, phase, out) {
  const a = t * TAU * 7 + phase;
  out[0] = Math.cos(a) * R * 0.5;
  out[1] = Math.sin(a * 1.7) * R * 0.5;
  out[2] = Math.sin(a) * R * 0.5;
}

// Лента Мёбиуса: полуоборот на полный обход, оттого одна сторона.
function mobius(t, w, out) {
  const u = t * TAU;
  const v = ((t * 97) % 1 - 0.5) * 0.5;
  const r = R * 0.7 * w;
  out[0] = (r + v * R * 0.5 * Math.cos(u / 2)) * Math.cos(u);
  out[1] = v * R * 0.5 * Math.sin(u / 2);
  out[2] = (r + v * R * 0.5 * Math.cos(u / 2)) * Math.sin(u);
}

// Часы без стрелок: концентрические кольца, каждое повёрнуто сильнее предыдущего.
function clockRings(i, n, w, out) {
  const rings = 6;
  const k = i % rings;
  const t = Math.floor(i / rings) / Math.max(1, Math.floor(n / rings));
  const a = t * TAU + k * 0.45;
  const r = R * (0.25 + k * 0.12) * w;
  out[0] = Math.cos(a) * r;
  // Кольца почти в одной плоскости: при разносе по высоте в три единицы они попадали
  // в РАЗНЫЕ ячейки сетки связности, и гейт объявлял часы россыпью. Циферблат плоский.
  out[1] = (k - rings / 2) * 0.6;
  out[2] = Math.sin(a) * r;
}

// Рёбра: ряд арок, уходящих вдаль.
function ribs(i, n, w, out) {
  const arcs = 9;
  const k = i % arcs;
  const t = Math.floor(i / arcs) / Math.max(1, Math.floor(n / arcs));
  const a = Math.PI * t;
  const rr = R * (0.85 - k * 0.05) * w;
  out[0] = Math.cos(a) * rr;
  out[1] = Math.sin(a) * rr;
  out[2] = -R * 0.9 + k * (R * 0.22);
}

// Водопад: вертикальный поток и брызги у пола.
function waterfall(i, n, t, out) {
  const splash = i % 3 === 0;
  if (splash) {
    // Заводь у подножия: широкая и плоская. При узких брызгах водопад по отпечатку
    // не отличался от обелиска — оба «столб плюс осыпь внизу». У водопада внизу
    // разлив, у обелиска кольцо обломков: это и есть разница.
    const a = (i / n) * TAU * 13;
    const r = R * 0.85 * Math.sqrt((i % 97) / 97);
    out[0] = Math.cos(a) * r;
    out[1] = -R * 0.92 + ((i % 13) / 13) * R * 0.05;
    out[2] = Math.sin(a) * r;
    return;
  }
  const a = t * TAU * 3;
  out[0] = Math.cos(a) * R * 0.16;
  out[1] = R * 0.9 - t * R * 1.8;
  out[2] = Math.sin(a) * R * 0.16;
}

// Улей: шестиугольные ячейки.
function hive(i, n, out) {
  const side = 11;
  const cell = i % (side * side);
  const cx = cell % side, cy = Math.floor(cell / side);
  const odd = cy % 2;
  const step = R * 0.16;
  out[0] = (cx - side / 2) * step * 1.73 + odd * step * 0.87;
  out[1] = (cy - side / 2) * step * 1.5;
  const ring = Math.floor(i / (side * side)) % 6;
  const a = (ring / 6) * TAU;
  out[0] += Math.cos(a) * step * 0.42;
  out[1] += Math.sin(a) * step * 0.42;
  out[2] = 0;
}

// Разлом: две плоскости и рваная щель между ними.
function rift(i, n, t, out) {
  const side = i % 2 === 0 ? -1 : 1;
  const jag = Math.sin(t * 37) * R * 0.12;
  // Щель настоящая, а не намёк: при узком зазоре разлом по отпечатку не отличался
  // от спирали Улама — обе читались плоским квадратом. Гейт назвал их близнецами.
  out[0] = side * (R * 0.35 + jag * side) + side * ((i % 29) / 29) * R * 0.6;
  out[1] = (t - 0.5) * R * 1.8;
  out[2] = Math.sin(t * 11) * R * 0.1;
}

// Маятник: дуга нити и след на полу.
function pendulum(i, n, t, out) {
  const trace = i % 4 === 0;
  const sw = Math.sin(t * TAU * 2) * (Math.PI / 5);
  if (trace) {
    out[0] = Math.sin(sw) * R * 0.95;
    out[1] = -R * 0.95;
    out[2] = Math.sin(t * TAU * 4) * R * 0.05;
    return;
  }
  const along = (i % 71) / 71;
  out[0] = Math.sin(sw) * R * along;
  out[1] = R * 0.9 - Math.cos(sw) * R * along * 1.85;
  out[2] = 0;
}

// Обелиск: столб-обводка и осыпающиеся вниз символы.
function obelisk(i, n, t, out) {
  const fallen = i % 6 === 0;
  if (fallen) {
    const a = (i / n) * TAU * 7;
    out[0] = Math.cos(a) * R * 0.4;
    out[1] = -R * 0.9 + ((i % 17) / 17) * R * 0.5;
    out[2] = Math.sin(a) * R * 0.4;
    return;
  }
  const face = i % 4;
  const up = (i % 251) / 251;
  const half = R * 0.16 * (1 - up * 0.35);
  const sx = face === 0 ? 1 : face === 1 ? -1 : ((i % 31) / 31 - 0.5) * 2;
  const sz = face === 2 ? 1 : face === 3 ? -1 : ((i % 37) / 37 - 0.5) * 2;
  out[0] = sx * half;
  out[1] = -R * 0.8 + up * R * 1.7;
  out[2] = sz * half;
}

// Спираль Улама: числа по спирали, простые ложатся дальше от плоскости.
function isPrime(v) {
  if (v < 2) return false;
  for (let d = 2; d * d <= v; d++) if (v % d === 0) return false;
  return true;
}
function ulam(i, n, out) {
  let x = 0, y = 0, dx = 1, dy = 0, len = 1, made = 0, turns = 0;
  for (let k = 1; k < i + 2; k++) {
    x += dx; y += dy; made++;
    if (made === len) { made = 0; const t = dx; dx = -dy; dy = t; turns++; if (turns % 2 === 0) len++; }
  }
  const s = R * 0.045;
  out[0] = x * s;
  out[1] = y * s;
  out[2] = isPrime(i + 2) ? R * 0.12 : 0;
}

// Песочные часы: два конуса, встречающиеся перемычкой.
function hourglass(i, n, t, out) {
  const a = (i / n) * TAU * 31;
  const h = (t - 0.5) * 2;
  const r = R * (0.12 + Math.abs(h) * 0.6);
  out[0] = Math.cos(a) * r;
  out[1] = h * R * 0.9;
  out[2] = Math.sin(a) * r;
}

// Кольца планеты: плоское кольцо вокруг тёмного ядра.
function planetRings(i, n, w, out) {
  const core = i % 7 === 0;
  const a = (i / n) * TAU * 17;
  if (core) {
    const r = R * 0.22 * Math.sqrt((i % 53) / 53);
    const b = ((i % 29) / 29 - 0.5) * Math.PI;
    out[0] = Math.cos(a) * Math.cos(b) * r;
    out[1] = Math.sin(b) * r;
    out[2] = Math.sin(a) * Math.cos(b) * r;
    return;
  }
  const r = R * (0.45 + ((i % 41) / 41) * 0.45) * w;
  out[0] = Math.cos(a) * r;
  out[1] = ((i % 11) / 11 - 0.5) * R * 0.03;
  out[2] = Math.sin(a) * r;
}

// Лестница Пенроуза: ступени по кругу, замыкающиеся сами на себя.
function penrose(i, n, out) {
  const steps = 24;
  const k = i % steps;
  const along = Math.floor(i / steps) / Math.max(1, Math.floor(n / steps));
  const a = (k / steps) * TAU;
  const rise = ((k % steps) / steps) * R * 0.5;
  const r = R * 0.65;
  out[0] = Math.cos(a) * (r + (along - 0.5) * R * 0.18);
  out[1] = rise - R * 0.25 + ((k % 2) ? R * 0.03 : 0);
  out[2] = Math.sin(a) * (r + (along - 0.5) * R * 0.18);
}
