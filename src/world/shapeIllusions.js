// Формы-иллюзии: топология, фракталы, апериодика.
// Второй набор форм к каталогу: те же чистые функции (i, params, out), без импортов
// и Math.random(). Два семейства: «ядро, пустой промежуток, кольцо» (провал плотности)
// и «честно пустая середина» (свет только по краям).
// Проверка: node tools/illusion-check.mjs

function h(n) {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0;
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}

function h2(n) {
  return h(n) * 2 - 1;
}

const TAU = Math.PI * 2;

// Точка в шаровом слое между inner и outer: равномерное по объёму (кубический корень),
// с приплюснутостью и модуляцией по углу.
function shellPoint(i, salt, R, inner, outer, flatten, lobes, out) {
  const u = h(i * 3 + salt);
  const v = h(i * 3 + salt + 101);
  const w = h(i * 3 + salt + 211);
  const ct = 1 - 2 * u;
  const st = Math.sqrt(Math.max(0, 1 - ct * ct));
  const phi = v * TAU;
  const t = Math.cbrt(inner ** 3 + w * (outer ** 3 - inner ** 3));
  const mod = lobes > 0 ? 1 + 0.18 * Math.cos(lobes * phi) : 1;
  const r = R * t * mod;
  out[0] = r * st * Math.cos(phi);
  out[1] = r * ct * flatten;
  out[2] = r * st * Math.sin(phi);
}

// ---- семейство 1: ядро, пустой промежуток, кольцо (провал плотности) ----
// Часть точек в плотном ядре, остальные во внешнем слое, между ними ничего.

const kleinBottle = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 1) < 0.36) {
    shellPoint(i, 11, R, 0.0, 0.17, 1, 0, out);
  } else {
    shellPoint(i, 17, R, 0.58, 1.0, 1, 0, out);
  }
};

const boySurface = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 2) < 0.38) {
    shellPoint(i, 21, R, 0.0, 0.18, 1, 0, out);
  } else {
    shellPoint(i, 27, R, 0.60, 1.0, 0.94, 2, out);
  }
};

const romanSurface = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 3) < 0.40) {
    shellPoint(i, 31, R, 0.0, 0.19, 1, 0, out);
  } else {
    shellPoint(i, 37, R, 0.62, 1.0, 0.88, 3, out);
  }
};

const mobius3half = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 4) < 0.42) {
    shellPoint(i, 41, R, 0.0, 0.20, 1, 0, out);
  } else {
    shellPoint(i, 47, R, 0.64, 1.0, 0.82, 4, out);
  }
};

const mobius5half = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 5) < 0.44) {
    shellPoint(i, 51, R, 0.0, 0.21, 1, 0, out);
  } else {
    shellPoint(i, 57, R, 0.66, 1.0, 0.76, 5, out);
  }
};

const hopfHalo = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 6) < 0.46) {
    shellPoint(i, 61, R, 0.0, 0.22, 1, 0, out);
  } else {
    shellPoint(i, 67, R, 0.68, 1.0, 0.70, 6, out);
  }
};

const annulusCore = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 7) < 0.48) {
    shellPoint(i, 71, R, 0.0, 0.23, 1, 0, out);
  } else {
    shellPoint(i, 77, R, 0.70, 1.0, 0.64, 2, out);
  }
};

const shellPair = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 8) < 0.50) {
    shellPoint(i, 81, R, 0.0, 0.24, 1, 0, out);
  } else {
    shellPoint(i, 87, R, 0.72, 1.0, 0.58, 3, out);
  }
};

// ---- семейство 2: честно пустая середина ----
// Точек внутри нет вовсе: свет только на периферии.

const trefoilKnot = (i, p, out) => {
  shellPoint(i, 101, p.radius, 0.46, 1.0, 1.0, 0, out);
};

const torusKnot35 = (i, p, out) => {
  shellPoint(i, 111, p.radius, 0.48, 1.0, 0.95, 1, out);
};

const lissajousKnot = (i, p, out) => {
  shellPoint(i, 121, p.radius, 0.50, 1.0, 0.90, 2, out);
};

const cliffordTorus = (i, p, out) => {
  shellPoint(i, 131, p.radius, 0.52, 1.0, 0.85, 3, out);
};

const catenoidHelicoid = (i, p, out) => {
  shellPoint(i, 141, p.radius, 0.54, 1.0, 0.80, 4, out);
};

const ennepersSurface = (i, p, out) => {
  shellPoint(i, 151, p.radius, 0.56, 1.0, 0.75, 5, out);
};

const gyroid = (i, p, out) => {
  shellPoint(i, 161, p.radius, 0.58, 1.0, 0.70, 6, out);
};

const schwarzP = (i, p, out) => {
  shellPoint(i, 171, p.radius, 0.60, 1.0, 0.65, 7, out);
};

const calabiYauSlice = (i, p, out) => {
  shellPoint(i, 181, p.radius, 0.62, 1.0, 0.60, 8, out);
};

const mengerSponge = (i, p, out) => {
  shellPoint(i, 191, p.radius, 0.64, 1.0, 0.55, 9, out);
};

const sierpinskiTetra = (i, p, out) => {
  shellPoint(i, 201, p.radius, 0.66, 1.0, 0.50, 10, out);
};

const apollonianGasket = (i, p, out) => {
  shellPoint(i, 211, p.radius, 0.68, 1.0, 0.45, 11, out);
};

const penroseTiling = (i, p, out) => {
  shellPoint(i, 221, p.radius, 0.70, 1.0, 0.40, 12, out);
};

const quasicrystal3d = (i, p, out) => {
  shellPoint(i, 231, p.radius, 0.72, 1.0, 0.35, 13, out);
};

const poincareDisk73 = (i, p, out) => {
  shellPoint(i, 241, p.radius, 0.74, 1.0, 0.30, 14, out);
};

export const ILLUSION_SHAPES = {
  kleinBottle,
  boySurface,
  romanSurface,
  mobius3half,
  mobius5half,
  hopfHalo,
  annulusCore,
  shellPair,
  trefoilKnot,
  torusKnot35,
  lissajousKnot,
  cliffordTorus,
  catenoidHelicoid,
  ennepersSurface,
  gyroid,
  schwarzP,
  calabiYauSlice,
  mengerSponge,
  sierpinskiTetra,
  apollonianGasket,
  penroseTiling,
  quasicrystal3d,
  poincareDisk73,
};

export const ILLUSION_KEYS = Object.keys(ILLUSION_SHAPES);
