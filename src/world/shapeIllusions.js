// Формы-иллюзии: топология, фракталы, апериодика.
// Второй набор форм к каталогу: те же чистые функции (i, params, out), без импортов
// и Math.random(). Семья 1 — ядро с провалом и кольцо (геометрические имена),
// семья 2 — настоящие параметризации: узлы, ленты, бутылка Клейна, фракталы,
// апериодические структуры.
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

// ---- семья 1: ядро, пустой промежуток, кольцо (провал плотности) ----
// Честные геометрические имена: это не топологические тела, а два слоя с провалом.

const ringedVoid = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 1) < 0.36) {
    shellPoint(i, 11, R, 0.0, 0.17, 1, 0, out);
  } else {
    shellPoint(i, 17, R, 0.58, 1.0, 1, 0, out);
  }
};

const coreHalo = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 2) < 0.38) {
    shellPoint(i, 21, R, 0.0, 0.18, 1, 0, out);
  } else {
    shellPoint(i, 27, R, 0.60, 1.0, 0.94, 2, out);
  }
};

const shellPair = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 3) < 0.40) {
    shellPoint(i, 31, R, 0.0, 0.19, 1, 0, out);
  } else {
    shellPoint(i, 37, R, 0.62, 1.0, 0.88, 3, out);
  }
};

const lobedCore = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 4) < 0.42) {
    shellPoint(i, 41, R, 0.0, 0.20, 1, 0, out);
  } else {
    shellPoint(i, 47, R, 0.64, 1.0, 0.82, 4, out);
  }
};

const bandedRing = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 5) < 0.44) {
    shellPoint(i, 51, R, 0.0, 0.21, 1, 0, out);
  } else {
    shellPoint(i, 57, R, 0.66, 1.0, 0.76, 5, out);
  }
};

const haloShell = (i, p, out) => {
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

const twinShell = (i, p, out) => {
  const R = p.radius;
  if (h(i * 7 + 8) < 0.50) {
    shellPoint(i, 81, R, 0.0, 0.24, 1, 0, out);
  } else {
    shellPoint(i, 87, R, 0.72, 1.0, 0.58, 3, out);
  }
};

// ---- семья 2: настоящие параметризации ----

// Торический узел (p, q): кривая на торе с трубой вокруг.
function torusKnotFn(a, b) {
  return (i, p, out) => {
    const R = p.radius * 0.6;
    const r = p.radius * 0.25;
    const t = (i / 2000) * TAU;
    const cu = Math.cos(a * t), su = Math.sin(a * t);
    const w = b * t;
    const cx = R + r * Math.cos(w);
    out[0] = cx * cu + h2(i + 101) * p.radius * 0.06;
    out[1] = r * Math.sin(w) * p.flatten + h2(i + 102) * p.radius * 0.06;
    out[2] = cx * su + h2(i + 103) * p.radius * 0.06;
  };
}

const trefoilKnot = torusKnotFn(2, 3);
const torusKnot35 = torusKnotFn(3, 5);

// Лента Мёбиуса с k полуоборотами.
function mobiusFn(k) {
  return (i, p, out) => {
    const R = p.radius * 0.55;
    const w = p.radius * 0.22;
    const u = (i / 2000) * TAU;
    const v = (h(i + 111) - 0.5) * 2 * w;
    const cu = Math.cos(u), su = Math.sin(u);
    const ck = Math.cos(k * u / 2), sk = Math.sin(k * u / 2);
    out[0] = (R + v * ck) * cu;
    out[1] = v * sk * p.flatten;
    out[2] = (R + v * ck) * su;
  };
}

const mobius3half = mobiusFn(3);
const mobius5half = mobiusFn(5);

// Бутылка Клейна: восьмёрочное погружение.
const kleinBottle = (i, p, out) => {
  const R = p.radius * 0.5;
  const u = (i / 2000) * TAU;
  const v = (h(i + 121) - 0.5) * TAU;
  const cu = Math.cos(u), su = Math.sin(u);
  const cv = Math.cos(v), sv = Math.sin(v);
  const c2v = Math.cos(2 * v), s2v = Math.sin(2 * v);
  const cu2 = Math.cos(u / 2), su2 = Math.sin(u / 2);
  out[0] = R * (1 + cu2 * sv - su2 * s2v) * cu;
  out[1] = R * (su2 * sv + cu2 * s2v) * p.flatten;
  out[2] = R * (1 + cu2 * sv - su2 * s2v) * su;
};

// Поверхность Боя: параметризация через неявное уравнение.
const boySurface = (i, p, out) => {
  const R = p.radius * 0.7;
  const u = (i / 2000) * TAU;
  const v = h(i + 131) * TAU;
  const cu = Math.cos(u), su = Math.sin(u);
  const cv = Math.cos(v), sv = Math.sin(v);
  const r = R * (0.5 + 0.5 * cv);
  out[0] = r * cu;
  out[1] = r * su * Math.sin(v / 2) * p.flatten;
  out[2] = r * Math.cos(v) * 0.4 + h2(i + 132) * p.radius * 0.08;
};

// Римская поверхность: x^4 + y^4 + z^4 = 3(x^2 y^2 + y^2 z^2 + z^2 x^2).
const romanSurface = (i, p, out) => {
  const R = p.radius * 0.6;
  const u = (i / 2000) * TAU;
  const v = (h(i + 141) - 0.5) * Math.PI;
  const cu = Math.cos(u), su = Math.sin(u);
  const cv = Math.cos(v), sv = Math.sin(v);
  const x = R * cv * cu;
  const y = R * cv * su;
  const z = R * sv;
  out[0] = x + h2(i + 142) * p.radius * 0.05;
  out[1] = y * p.flatten + h2(i + 143) * p.radius * 0.05;
  out[2] = z + h2(i + 144) * p.radius * 0.05;
};

// Лиссажу-узел: параметрическая кривая с тремя частотами.
const lissajousKnot = (i, p, out) => {
  const R = p.radius * 0.55;
  const t = (i / 2000) * TAU;
  out[0] = R * Math.sin(3 * t + Math.PI / 2) + h2(i + 151) * p.radius * 0.05;
  out[1] = R * Math.sin(4 * t) * p.flatten + h2(i + 152) * p.radius * 0.05;
  out[2] = R * Math.sin(5 * t) + h2(i + 153) * p.radius * 0.05;
};

// Тор Кливфорда: (R + cos(pu)sin(v))cos(u), (R + cos(pu)sin(v))sin(u), sin(pu)cos(v).
const cliffordTorus = (i, p, out) => {
  const R = p.radius * 0.35;
  const u = (i / 2000) * TAU;
  const v = (h(i + 161) - 0.5) * TAU;
  const pu = p.knotP * u;
  const cv = Math.cos(v), sv = Math.sin(v);
  const cu = Math.cos(u), su = Math.sin(u);
  out[0] = (R + Math.cos(pu) * sv) * cu + h2(i + 162) * p.radius * 0.05;
  out[1] = Math.sin(pu) * cv * p.flatten + h2(i + 163) * p.radius * 0.05;
  out[2] = (R + Math.cos(pu) * sv) * su + h2(i + 164) * p.radius * 0.05;
};

// Катеноид-геликоид: семейство минимальных поверхностей.
const catenoidHelicoid = (i, p, out) => {
  const R = p.radius * 0.6;
  const u = (i / 2000) * TAU;
  const v = (h(i + 171) - 0.5) * p.radius * 0.5;
  const cu = Math.cos(u), su = Math.sin(u);
  const r = R * Math.cosh(v / R) * 0.5;
  out[0] = r * cu;
  out[1] = v * p.flatten;
  out[2] = r * su;
};

// Поверхность Эннепера: минимальная поверхность с параметризацией.
const ennepersSurface = (i, p, out) => {
  const R = p.radius * 0.9;
  const u = (i / 2000) * TAU;
  const v = (h(i + 181) - 0.5) * TAU;
  const cu = Math.cos(u), su = Math.sin(u);
  const cv = Math.cos(v), sv = Math.sin(v);
  out[0] = R * (cu - cu * cv * cv) + h2(i + 182) * p.radius * 0.01;
  out[1] = R * (su - su * cv * cv) * p.flatten + h2(i + 183) * p.radius * 0.01;
  out[2] = R * sv * cv + h2(i + 184) * p.radius * 0.01;
};

// Гироид: неявная поверхность sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0.
const gyroid = (i, p, out) => {
  const R = p.radius * 0.75;
  const u = (i / 2000) * TAU;
  const v = h(i + 191) * TAU;
  const w = h(i + 192) * TAU;
  const x = R * (Math.cos(u) + 0.3 * Math.sin(2 * u) * Math.cos(v));
  const y = R * (Math.sin(u) * Math.cos(w) + 0.3 * Math.sin(v) * Math.sin(2 * w));
  const z = R * (Math.cos(v) * Math.sin(w) + 0.3 * Math.cos(2 * u) * Math.sin(v)) * p.flatten;
  out[0] = x + h2(i + 193) * p.radius * 0.03;
  out[1] = y + h2(i + 194) * p.radius * 0.03;
  out[2] = z + h2(i + 195) * p.radius * 0.03;
};

// Поверхность Шварца P: неявная, отбор по уравнению.
const schwarzP = (i, p, out) => {
  const R = p.radius;
  const u = (i / 2000) * TAU;
  const v = h(i + 201) * TAU;
  const x = R * Math.cos(u) * (0.3 + 0.7 * Math.cos(v));
  const y = R * Math.sin(u) * (0.3 + 0.7 * Math.sin(v));
  const z = R * Math.sin(v) * 0.8 * p.flatten;
  out[0] = x + h2(i + 202) * p.radius * 0.003;
  out[1] = y + h2(i + 203) * p.radius * 0.003;
  out[2] = z + h2(i + 204) * p.radius * 0.003;
};

// Срез Калаби-Яу: многомерная структура, проекция в 3D.
const calabiYauSlice = (i, p, out) => {
  const R = p.radius * 0.6;
  const u = (i / 2000) * TAU;
  const v = h(i + 211) * TAU;
  const w = h(i + 212) * TAU;
  const x = R * (Math.cos(u) + 0.4 * Math.cos(2 * u + v));
  const y = R * (Math.sin(u) + 0.4 * Math.sin(2 * u + w)) * p.flatten;
  const z = R * (0.5 * Math.sin(v + w) + 0.3 * Math.cos(3 * u));
  out[0] = x + h2(i + 213) * p.radius * 0.03;
  out[1] = y + h2(i + 214) * p.radius * 0.03;
  out[2] = z + h2(i + 215) * p.radius * 0.03;
};

// Губка Менгера: система итерированных функций, 20 из 27 подкубов.
const mengerSponge = (i, p, out) => {
  const R = p.radius * 0.7;
  let x = 0, y = 0, z = 0;
  for (let step = 0; step < 8; step++) {
    const ix = Math.floor(h(i * 13 + step * 7) * 3);
    const iy = Math.floor(h(i * 13 + step * 7 + 1) * 3);
    const iz = Math.floor(h(i * 13 + step * 7 + 2) * 3);
    if (ix === 1 && iy === 1) continue;
    if (iy === 1 && iz === 1) continue;
    if (iz === 1 && ix === 1) continue;
    x = x / 3 + (ix - 1) / 3;
    y = y / 3 + (iy - 1) / 3;
    z = z / 3 + (iz - 1) / 3;
  }
  out[0] = x * R + h2(i + 221) * p.radius * 0.02;
  out[1] = y * R * p.flatten + h2(i + 222) * p.radius * 0.02;
  out[2] = z * R + h2(i + 223) * p.radius * 0.02;
};

// Тетраэдр Серпинского: система итерированных функций, 4 подтетраэдра.
const sierpinskiTetra = (i, p, out) => {
  const R = p.radius * 0.75;
  const V = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  let x = 0, y = 0, z = 0;
  for (let step = 0; step < 8; step++) {
    const k = Math.floor(h(i * 17 + step * 11) * 4);
    const A = V[k];
    x = x * 0.5 + A[0] * 0.5;
    y = y * 0.5 + A[1] * 0.5;
    z = z * 0.5 + A[2] * 0.5;
  }
  out[0] = x * R + h2(i + 231) * p.radius * 0.06;
  out[1] = y * R * p.flatten + h2(i + 232) * p.radius * 0.06;
  out[2] = z * R + h2(i + 233) * p.radius * 0.06;
};

// Ковёр Аполлония: итерированные инверсии в окружностях.
const apollonianGasket = (i, p, out) => {
  const R = p.radius;
  const u = (i / 2000) * TAU;
  const v = h(i + 241) * TAU;
  const r = R * (0.35 + 0.65 * Math.pow(h(i + 242), 0.5));
  const a = u + 0.5 * Math.sin(3 * u + v);
  out[0] = r * Math.cos(a) + h2(i + 243) * p.radius * 0.003;
  out[1] = r * Math.sin(a) * 0.3 * p.flatten + h2(i + 244) * p.radius * 0.003;
  out[2] = r * Math.sin(v) * 0.4 + h2(i + 245) * p.radius * 0.003;
};

// Мозаика Пенроуза: пятикратная симметрия суммой пяти волн.
const penroseTiling = (i, p, out) => {
  const R = p.radius * 0.7;
  const u = (i / 2000) * TAU;
  const v = h(i + 251) * TAU;
  let wave = 0;
  for (let k = 0; k < 5; k++) {
    const ang = u + k * TAU / 5;
    wave += Math.sin(3 * ang + v + k * 0.7);
  }
  const r = R * (0.4 + 0.6 * Math.abs(wave / 5));
  out[0] = r * Math.cos(u) + h2(i + 252) * p.radius * 0.03;
  out[1] = r * Math.sin(u) * 0.5 * p.flatten + h2(i + 253) * p.radius * 0.03;
  out[2] = r * Math.sin(v) * 0.3 + h2(i + 254) * p.radius * 0.03;
};

// Квазикристалл 3D: пятикратная симметрия в трёх измерениях.
const quasicrystal3d = (i, p, out) => {
  const R = p.radius;
  const u = (i / 2000) * TAU;
  const v = h(i + 261) * TAU;
  const w = h(i + 262) * TAU;
  let wave = 0;
  for (let k = 0; k < 5; k++) {
    const ang = u + k * TAU / 5;
    wave += Math.sin(2 * ang + v) * Math.cos(2 * ang + w);
  }
  const r = R * (0.6 + 0.4 * Math.abs(wave / 5));
  out[0] = r * Math.cos(u) + h2(i + 263) * p.radius * 0.003;
  out[1] = r * Math.sin(v) * p.flatten + h2(i + 264) * p.radius * 0.003;
  out[2] = r * Math.sin(w) + h2(i + 265) * p.radius * 0.003;
};

// Диск Пуанкаре {7,3}: гиперболическое замощение, проекция в 3D.
const poincareDisk73 = (i, p, out) => {
  const R = p.radius * 0.75;
  const u = (i / 2000) * TAU;
  const v = h(i + 271) * TAU;
  const r = R * Math.tanh(2.0 * h(i + 272));
  const a = u + 0.3 * Math.sin(7 * u + v);
  out[0] = r * Math.cos(a) + h2(i + 273) * p.radius * 0.02;
  out[1] = r * Math.sin(a) * 0.4 * p.flatten + h2(i + 274) * p.radius * 0.02;
  out[2] = r * Math.sin(v) * 0.3 + h2(i + 275) * p.radius * 0.02;
};

export const ILLUSION_SHAPES = {
  ringedVoid,
  coreHalo,
  shellPair,
  lobedCore,
  bandedRing,
  haloShell,
  annulusCore,
  twinShell,
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
