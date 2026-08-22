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

export const ILLUSION_SHAPES = SHAPES;
export const ILLUSION_KEYS = Object.keys(SHAPES);
