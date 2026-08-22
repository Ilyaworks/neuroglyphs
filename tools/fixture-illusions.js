// Эталон для tools/illusion-check.mjs: набор форм, заведомо выполняющий контракт задачи.
//
// Формы тут нарочно простые и семейственные: восемь «ядро, пустота, кольцо» и двенадцать
// с честно пустой серединой, собранные двумя фабриками с разными параметрами. Красивых
// топологических тел здесь нет и быть не должно — эталон существует, чтобы гейт можно было
// проверить в обе стороны, а не чтобы служить образцом для копирования.
//
// Подпись форм та же, что у каталога: (i, params, out), чистые функции, без Math.random.
const TAU = Math.PI * 2;

// Детерминированный хеш: ряд «случайных» чисел, одинаковый от запуска к запуску.
function h(n) {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0;
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}

// Точка в шаровом слое между inner и outer, с приплюснутостью и модуляцией по углу.
function shellPoint(i, salt, R, inner, outer, flatten, lobes, out) {
  const u = h(i * 3 + salt);
  const v = h(i * 3 + salt + 101);
  const w = h(i * 3 + salt + 211);
  const ct = 1 - 2 * u;
  const st = Math.sqrt(Math.max(0, 1 - ct * ct));
  const phi = v * TAU;
  // Радиус по кубическому корню, чтобы слой заполнялся объёмом, а не оболочкой.
  const t = Math.cbrt(inner ** 3 + w * (outer ** 3 - inner ** 3));
  const mod = lobes > 0 ? 1 + 0.18 * Math.cos(lobes * phi) : 1;
  const r = R * t * mod;
  out[0] = r * st * Math.cos(phi);
  out[1] = r * ct * flatten;
  out[2] = r * st * Math.sin(phi);
}

// Семейство «ядро, пустой промежуток, кольцо»: часть точек в плотном ядре, остальные
// во внешнем слое, между ними ничего. Это и даёт провал плотности.
function coreGapRing(k) {
  const coreShare = 0.34 + 0.02 * k;
  const coreR = 0.16 + 0.012 * k;
  const ringInner = 0.58 + 0.025 * k;
  const flatten = 1 - 0.06 * (k % 4);
  const lobes = k % 3 === 0 ? 0 : (k % 3) + 2;
  return (i, p, out) => {
    const R = p.radius;
    if (h(i * 7 + k) < coreShare) {
      shellPoint(i, k * 13 + 1, R, 0.0, coreR, 1, 0, out);
    } else {
      shellPoint(i, k * 13 + 7, R, ringInner, 1.0, flatten, lobes, out);
    }
  };
}

// Семейство «честно пустая середина»: точек внутри нет вовсе, свет только по краям.
function hollowShell(k) {
  const inner = 0.46 + 0.028 * k;
  const flatten = 1 - 0.05 * (k % 5);
  const lobes = k % 4 === 0 ? 0 : (k % 4) + 1;
  const tilt = (k % 3) * 0.25;
  return (i, p, out) => {
    shellPoint(i, k * 29 + 3, p.radius, inner, 1.0, flatten, lobes, out);
    if (tilt > 0) {
      const y = out[1], z = out[2];
      out[1] = y * Math.cos(tilt) - z * Math.sin(tilt);
      out[2] = y * Math.sin(tilt) + z * Math.cos(tilt);
    }
  };
}

const SHAPES = {};
for (let k = 0; k < 8; k++) SHAPES['coreGapRing' + (k + 1)] = coreGapRing(k);
for (let k = 0; k < 12; k++) SHAPES['hollowShell' + (k + 1)] = hollowShell(k);

// Четыре формы с настоящей структурой: без них у набора не будет разброса, а гейт требует
// именно его — двадцать оболочек с разными параметрами это один приём, а не двадцать форм.
// Имена нарочно бытовые: эталон не должен прикидываться бутылкой Клейна.
const structured = {
  ribbonKnot: (i, p, out) => {
    const t = ((i % 6000) / 6000) * TAU * 3;
    const R = p.radius * 0.6, r = p.radius * 0.22;
    const u = h(i * 5 + 17) * TAU, w = h(i * 5 + 29);
    const cx = (R + r * Math.cos(3 * t)) * Math.cos(2 * t);
    const cy = r * Math.sin(3 * t) * 1.4;
    const cz = (R + r * Math.cos(3 * t)) * Math.sin(2 * t);
    const tube = p.radius * 0.06 * Math.cbrt(w);
    out[0] = cx + tube * Math.cos(u);
    out[1] = cy + tube * Math.sin(u);
    out[2] = cz + tube * Math.cos(u * 1.7);
  },
  slabGrid: (i, p, out) => {
    const n = 22;
    const x = i % n, y = Math.floor(i / n) % 3, z = Math.floor(i / (n * 3)) % n;
    out[0] = (x / (n - 1) - 0.5) * 2 * p.radius;
    out[1] = (y - 1) * p.radius * 0.08;
    out[2] = (z / (n - 1) - 0.5) * 2 * p.radius;
  },
  spiralSheet: (i, p, out) => {
    const t = ((i % 6000) / 6000);
    const a = t * TAU * 5;
    const r = p.radius * (0.15 + 0.85 * t);
    // Лист, а не линия: разброс поперёк и по радиусу, иначе барьер объёма не пройден.
    const j = (h(i * 11 + 3) - 0.5) * p.radius * 0.30;
    const rj = r + (h(i * 11 + 9) - 0.5) * p.radius * 0.22;
    out[0] = Math.cos(a) * rj;
    out[1] = (t - 0.5) * p.radius * 1.2 + j;
    out[2] = Math.sin(a) * rj;
  },
  cageEdges: (i, p, out) => {
    // Только рёбра куба: направления заняты не все, в отличие от шарового слоя.
    const R = p.radius;
    const edge = i % 12;
    const t = h(i * 13 + 7) * 2 - 1;
    const c = [[t, -1, -1], [t, 1, -1], [t, -1, 1], [t, 1, 1],
               [-1, t, -1], [1, t, -1], [-1, t, 1], [1, t, 1],
               [-1, -1, t], [1, -1, t], [-1, 1, t], [1, 1, t]][edge];
    // Бруски, а не проволока: тонкие рёбра барьер объёма не проходят, и правильно.
    const j = p.radius * 0.22;
    out[0] = c[0] * R + (h(i * 17 + 1) - 0.5) * j;
    out[1] = c[1] * R + (h(i * 17 + 2) - 0.5) * j;
    out[2] = c[2] * R + (h(i * 17 + 3) - 0.5) * j;
  },
};
for (const [k, fn] of Object.entries(structured)) SHAPES[k] = fn;

const extra = {
  jetCone: (i, p, out) => {
    // Узкая струя вдоль одной оси: занята малая часть направлений, разброс по секторам
    // получается кратно выше, чем у любого шарового слоя.
    const t = h(i * 19 + 5);
    const a = h(i * 19 + 11) * TAU;
    const spread = 0.14 * Math.sqrt(h(i * 19 + 23));
    const r = p.radius * (0.1 + 0.9 * t);
    out[0] = r * spread * Math.cos(a);
    out[1] = r;
    out[2] = r * spread * Math.sin(a);
  },
};
for (const [k, fn] of Object.entries(extra)) SHAPES[k] = fn;

export const ILLUSION_SHAPES = SHAPES;
export const ILLUSION_KEYS = Object.keys(SHAPES);
